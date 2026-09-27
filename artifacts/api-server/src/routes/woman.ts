import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { AddSkillBody, GetCourseParams, SubmitSkillEvidenceBody, UpdateProfileBody, UpdateSkillBody } from "@workspace/api-zod";
import { applicationsTable, db, notificationsTable, opportunitiesTable, skillAssessmentsTable, userSkillsTable, usersTable, womenProfilesTable, employersTable } from "@workspace/db";
import type { Application, Profile, Skill } from "@workspace/api-zod";
import { me, requireRole } from "../lib/auth";
import { HttpError, isHttpUrl, optionalText, parse, requireText } from "../lib/http";
import { ensureSkill } from "../lib/catalog";
import { GOOD_MATCH, currentScore, learnerExtras, loadCourseBySkill, loadLearner, rankedMatches, refreshScore, toOpportunityDto, type Learner } from "../lib/learner";
import { listScoreHistory } from "../lib/sakhi-score";
import { notify } from "../lib/notify";
import { applicationDto } from "./opportunities";

const router: IRouter = Router();
router.use(["/dashboard", "/sakhi-score", "/recommendations", "/profile", "/skills", "/assessments"], requireRole("woman"));

const PROFILE_FIELDS = 11;
function completion(l: Learner): number {
  const p = l.profile;
  const filled = [l.name, p.city, p.area, p.education, p.employmentStatus, p.interests.length, p.workPreferences.length, p.availability, p.goal, p.experienceNotes, l.skills.length].filter(Boolean).length;
  return Math.round((filled / PROFILE_FIELDS) * 100);
}

export async function skillDtos(learner: Learner): Promise<Skill[]> {
  const courseBySkill = await loadCourseBySkill();
  return learner.skills.map((s) => {
    const course = courseBySkill.get(s.name.toLowerCase());
    return {
      id: s.id, skillId: s.skillId, name: s.name, category: s.category, level: s.level, verified: s.verified, verificationStatus: s.status,
      yearsExperience: s.years, evidenceType: s.evidenceType, evidenceUrl: s.evidenceUrl, evidenceNote: s.evidenceNote, reviewNotes: s.reviewNotes,
      improvement: s.verified ? "Keep building practice evidence" : s.status === "Pending Review" ? "Evidence is with a reviewer" : course ? `Take ${course.title}` : "Add evidence for review",
      assessmentCourseId: course?.id ?? null, recommendedCourse: course ? { id: course.id, title: course.title } : null,
    };
  });
}

export async function profileDtoFor(userId: number): Promise<Profile> {
  const { learner, result } = await currentScore(userId);
  const [u] = await db.select({ email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, userId));
  const ranked = await rankedMatches(learner);
  const p = learner.profile;
  return {
    name: learner.name, email: u?.email, phone: u?.phone ?? undefined, city: p.city, area: p.area, education: p.education, employmentStatus: p.employmentStatus,
    interests: p.interests, goal: p.goal, experienceNotes: p.experienceNotes, completion: completion(learner), readiness: result.score, readinessLevel: result.level,
    availability: p.availability, workPreferences: p.workPreferences, skills: await skillDtos(learner), verifiedSkills: learner.skills.filter((s) => s.verified).map((s) => s.name),
    readyFor: ranked.filter(({ m }) => m.match >= GOOD_MATCH).slice(0, 3).map(({ opp }) => opp.title), developNext: result.areasToImprove.slice(0, 2),
  };
}

router.get("/dashboard", async (req, res) => {
  const user = me(req);
  const { learner, result } = await currentScore(user.id);
  const ranked = await rankedMatches(learner);
  const extras = await learnerExtras(user.id);
  const apps = await db
    .select({ a: applicationsTable, o: opportunitiesTable, e: employersTable })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId))
    .where(eq(applicationsTable.userId, user.id))
    .orderBy(desc(applicationsTable.appliedAt));
  const [{ unread }] = await db.select({ unread: sql<number>`count(*)::int` }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), sql`${notificationsTable.readAt} is null`));
  res.json({
    welcome: `Welcome back, ${learner.name.split(" ")[0]}!`,
    profileCompletion: completion(learner), skillsAdded: learner.skills.length,
    coursesCompleted: learner.courses.filter((c) => c.status === "completed").length, assessmentsPassed: learner.assessmentsPassed,
    opportunitiesMatched: ranked.filter(({ m }) => m.match >= GOOD_MATCH).length, applications: apps.length, readiness: result.score,
    recommendedNextStep: { title: result.recommendedNextStep.title, reason: result.recommendedNextStep.reason },
    topOpportunities: ranked.slice(0, 3).map(({ opp, m }) => toOpportunityDto(opp, m, extras)),
    applicationsList: apps.slice(0, 5).map(({ a, o, e }): Application => applicationDto(a, o.title, e.businessName)),
    unreadNotifications: unread,
  });
});

router.get("/sakhi-score", async (req, res) => {
  res.json((await currentScore(me(req).id)).result);
});
router.get("/sakhi-score/explanation", async (req, res) => {
  res.json((await currentScore(me(req).id)).result);
});
router.get("/sakhi-score/history", async (req, res) => {
  const user = me(req);
  await currentScore(user.id);
  res.json(await listScoreHistory(user.id));
});
router.get("/recommendations/next-step", async (req, res) => {
  res.json((await currentScore(me(req).id)).result.recommendedNextStep);
});

router.get("/profile", async (req, res) => {
  res.json(await profileDtoFor(me(req).id));
});

router.put("/profile", async (req, res) => {
  const user = me(req);
  const b = parse(UpdateProfileBody, req.body);
  const userPatch: Partial<typeof usersTable.$inferInsert> = {};
  if (b.name !== undefined) userPatch.name = requireText(b.name, "Name", 100);
  if (b.phone !== undefined) {
    const phone = requireText(b.phone, "Phone", 20);
    if (!/^[+]?[0-9 ()-]{7,20}$/.test(phone)) throw new HttpError(400, "Please enter a valid phone number.");
    userPatch.phone = phone;
  }
  if (Object.keys(userPatch).length) await db.update(usersTable).set(userPatch).where(eq(usersTable.id, user.id));
  const patch: Partial<typeof womenProfilesTable.$inferInsert> = { updatedAt: new Date() };
  if (b.city !== undefined) patch.city = requireText(b.city, "City", 100);
  if (b.area !== undefined) patch.area = optionalText(b.area, "Area", 100) ?? "";
  if (b.education !== undefined) patch.education = optionalText(b.education, "Education", 100) ?? "";
  if (b.employmentStatus !== undefined) patch.employmentStatus = optionalText(b.employmentStatus, "Employment status", 100) ?? "";
  if (b.interests !== undefined) patch.interests = b.interests.map((i) => i.trim()).filter(Boolean).slice(0, 15);
  if (b.goal !== undefined) patch.goal = optionalText(b.goal, "Goal", 500) ?? "";
  if (b.availability !== undefined) patch.availability = optionalText(b.availability, "Availability", 200) ?? "";
  if (b.workPreferences !== undefined) patch.workPreferences = b.workPreferences.slice(0, 6);
  if (b.experienceNotes !== undefined) patch.experienceNotes = optionalText(b.experienceNotes, "Experience notes", 2000) ?? "";
  await db.update(womenProfilesTable).set(patch).where(eq(womenProfilesTable.userId, user.id));
  await refreshScore(user.id, "Profile details updated");
  res.json(await profileDtoFor(user.id));
});

// ---- skills --------------------------------------------------------------
router.get("/skills", async (req, res) => {
  res.json(await skillDtos(await loadLearner(me(req).id)));
});

router.post("/skills", async (req, res) => {
  const user = me(req);
  const b = parse(AddSkillBody, req.body);
  const skill = await ensureSkill(b.name);
  const [dup] = await db.select({ id: userSkillsTable.id }).from(userSkillsTable).where(and(eq(userSkillsTable.userId, user.id), eq(userSkillsTable.skillId, skill.id)));
  if (dup) throw new HttpError(409, `${skill.name} is already on your profile.`);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(userSkillsTable).where(eq(userSkillsTable.userId, user.id));
  if (n >= 30) throw new HttpError(400, "You can list up to 30 skills.");
  const [row] = await db.insert(userSkillsTable).values({ userId: user.id, skillId: skill.id, level: requireText(b.level, "Level", 40), yearsExperience: Math.max(0, Math.min(60, Math.round(b.yearsExperience ?? 0))) }).returning();
  await refreshScore(user.id, `Added skill: ${skill.name}`);
  const dto = (await skillDtos(await loadLearner(user.id))).find((s) => s.id === row!.id)!;
  res.status(201).json(dto);
});

async function ownSkill(userId: number, id: number) {
  const [row] = await db.select().from(userSkillsTable).where(and(eq(userSkillsTable.id, id), eq(userSkillsTable.userId, userId)));
  if (!row) throw new HttpError(404, "Skill not found.");
  return row;
}

router.put("/skills/:id", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  const b = parse(UpdateSkillBody, req.body);
  await ownSkill(user.id, id);
  const patch: Partial<typeof userSkillsTable.$inferInsert> = { updatedAt: new Date() };
  if (b.level !== undefined) patch.level = requireText(b.level, "Level", 40);
  if (b.yearsExperience !== undefined) patch.yearsExperience = Math.max(0, Math.min(60, Math.round(b.yearsExperience)));
  await db.update(userSkillsTable).set(patch).where(eq(userSkillsTable.id, id));
  await refreshScore(user.id, "Skill details updated");
  res.json((await skillDtos(await loadLearner(user.id))).find((s) => s.id === id));
});

router.delete("/skills/:id", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  await ownSkill(user.id, id);
  await db.delete(userSkillsTable).where(eq(userSkillsTable.id, id));
  await refreshScore(user.id, "Skill removed");
  res.json({ ok: true });
});

router.post("/skills/:id/evidence", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  const b = parse(SubmitSkillEvidenceBody, req.body);
  const row = await ownSkill(user.id, id);
  const url = b.url?.trim();
  const note = optionalText(b.note, "Note", 1000);
  if (!url && !note) throw new HttpError(400, "Add a link or a short description of your evidence.");
  if (url && !isHttpUrl(url)) throw new HttpError(400, "Evidence link must start with http:// or https://");
  // Submitting evidence never verifies a skill; it queues it for a reviewer. Already-verified skills keep their status.
  await db.update(userSkillsTable).set({
    evidenceType: b.type, evidenceUrl: url || null, evidenceNote: note || null, updatedAt: new Date(),
    ...(row.verificationStatus === "Verified" ? {} : { verificationStatus: "Pending Review" as const, reviewNotes: null }),
  }).where(eq(userSkillsTable.id, id));
  const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
  for (const a of admins) await notify(a.id, "skill_verification", "Skill evidence awaiting review", `${user.name} submitted ${b.type} evidence.`, "/admin/users");
  res.json((await skillDtos(await loadLearner(user.id))).find((s) => s.id === id));
});

router.get("/assessments", async (req, res) => {
  const user = me(req);
  const learner = await loadLearner(user.id);
  const courseBySkill = await loadCourseBySkill();
  const attempts = await db.select({ courseId: skillAssessmentsTable.courseId, score: skillAssessmentsTable.score }).from(skillAssessmentsTable).where(eq(skillAssessmentsTable.userId, user.id));
  res.json(learner.skills.map((s) => {
    const course = courseBySkill.get(s.name.toLowerCase());
    const mine = course ? attempts.filter((a) => a.courseId === course.id) : [];
    return { skillId: s.skillId, skillName: s.name, verificationStatus: s.status, courseId: course?.id ?? null, courseTitle: course?.title ?? null, attempts: mine.length, bestScore: mine.length ? Math.round(Math.max(...mine.map((a) => a.score))) : null };
  }));
});

export default router;
