import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CreateAdminCourseBody, CreateAdminLessonBody, CreateAdminLessonParams, CreateAdminQuestionBody, CreateAdminQuestionParams, DeleteAdminLessonParams,
  DeleteAdminQuestionParams, GetAdminUserParams, ListAdminEmployersQueryParams, ListAdminReportsQueryParams, ListAdminUsersQueryParams, ReviewReportBody,
  ReviewReportParams, ReviewSkillEvidenceBody, ReviewSkillEvidenceParams, UpdateAdminCourseBody, UpdateAdminCourseParams, UpdateAdminLessonBody, UpdateAdminLessonParams,
  UpdateAdminOpportunityStatusBody, UpdateAdminOpportunityStatusParams, UpdateAdminQuestionBody, UpdateAdminQuestionParams, UpdateAdminUserStatusBody, UpdateAdminUserStatusParams,
  VerifyEmployerBody, VerifyEmployerParams,
} from "@workspace/api-zod";
import {
  applicationsTable, assessmentQuestionsTable, courseLessonsTable, coursesTable, db, employerVerificationsTable, employersTable, opportunitiesTable,
  reportsTable, sessionsTable, skillsTable, userSkillsTable, usersTable, womenProfilesTable,
} from "@workspace/db";
import { me, requireRole } from "../lib/auth";
import { HttpError, isHttpUrl, optionalText, parse, requireText } from "../lib/http";
import { ensureSkill } from "../lib/catalog";
import { refreshScore } from "../lib/learner";
import { notify } from "../lib/notify";
import { reportDto } from "./engagement";
import { profileDtoFor } from "./woman";

const router: IRouter = Router();
router.use("/admin", requireRole("admin"));
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

router.get("/admin/dashboard", async (_req, res) => {
  const count = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  res.json({
    totalWomen: await count(db.select({ n }).from(usersTable).where(eq(usersTable.role, "woman"))),
    totalEmployers: await count(db.select({ n }).from(employersTable)),
    verifiedEmployers: await count(db.select({ n }).from(employersTable).where(eq(employersTable.verificationStatus, "Verified"))),
    pendingEmployers: await count(db.select({ n }).from(employersTable).where(eq(employersTable.verificationStatus, "Pending"))),
    activeOpportunities: await count(db.select({ n }).from(opportunitiesTable).where(eq(opportunitiesTable.status, "open"))),
    applications: await count(db.select({ n }).from(applicationsTable)),
    courses: await count(db.select({ n }).from(coursesTable)),
    openReports: await count(db.select({ n }).from(reportsTable).where(inArray(reportsTable.status, ["Open", "Under Review"]))),
    pendingSkillEvidence: await count(db.select({ n }).from(userSkillsTable).where(eq(userSkillsTable.verificationStatus, "Pending Review"))),
  });
});

// ---- users ---------------------------------------------------------------------
async function adminUsers(where?: ReturnType<typeof and>) {
  const rows = await db
    .select({
      u: usersTable, city: womenProfilesTable.city,
      skills: sql<number>`(select count(*)::int from user_skills us where us.user_id = ${usersTable.id})`,
      score: sql<number | null>`(select h.score from sakhi_score_history h where h.user_id = ${usersTable.id} order by h.created_at desc, h.id desc limit 1)`,
    })
    .from(usersTable)
    .leftJoin(womenProfilesTable, eq(womenProfilesTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(usersTable.createdAt));
  return rows.map((r) => ({ id: r.u.id, role: r.u.role, name: r.u.name, email: r.u.email, phone: r.u.phone, status: r.u.status, createdAt: r.u.createdAt.toISOString(), city: r.city ?? null, skillsCount: r.skills, sakhiScore: r.score }));
}

router.get("/admin/users", async (req, res) => {
  const q = parse(ListAdminUsersQueryParams, req.query);
  res.json(await adminUsers(q.role ? eq(usersTable.role, q.role as "woman" | "employer" | "admin") : undefined));
});

router.get("/admin/users/:id", async (req, res) => {
  const { id } = parse(GetAdminUserParams, req.params);
  const [user] = await adminUsers(eq(usersTable.id, id));
  if (!user) throw new HttpError(404, "User not found.");
  const [apps] = await db.select({ n: sql<number>`count(*)::int` }).from(applicationsTable).where(eq(applicationsTable.userId, id));
  let against = 0;
  if (user.role === "employer") {
    const [e] = await db.select({ id: employersTable.id }).from(employersTable).where(eq(employersTable.userId, id));
    if (e) {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(reportsTable).where(sql`(${reportsTable.targetType} = 'employer' and ${reportsTable.targetId} = ${e.id}) or (${reportsTable.targetType} = 'opportunity' and ${reportsTable.targetId} in (select id from opportunities where employer_id = ${e.id}))`);
      against = r?.n ?? 0;
    }
  }
  res.json({ user, profile: user.role === "woman" ? await profileDtoFor(id) : null, applications: apps?.n ?? 0, reportsAgainst: against });
});

router.put("/admin/users/:id/status", async (req, res) => {
  const actor = me(req);
  const { id } = parse(UpdateAdminUserStatusParams, req.params);
  const { status } = parse(UpdateAdminUserStatusBody, req.body);
  if (status !== "active" && status !== "suspended") throw new HttpError(400, "Status must be active or suspended.");
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) throw new HttpError(404, "User not found.");
  if (target.role === "admin" || target.id === actor.id) throw new HttpError(403, "Administrator accounts cannot be suspended here.");
  await db.update(usersTable).set({ status }).where(eq(usersTable.id, id));
  if (status === "suspended") await db.delete(sessionsTable).where(eq(sessionsTable.userId, id));
  res.json((await adminUsers(eq(usersTable.id, id)))[0]);
});

// ---- employers -------------------------------------------------------------------
async function adminEmployers(where?: ReturnType<typeof and>) {
  const rows = await db
    .select({ e: employersTable, u: usersTable, opps: sql<number>`(select count(*)::int from opportunities o where o.employer_id = ${employersTable.id})` })
    .from(employersTable).innerJoin(usersTable, eq(usersTable.id, employersTable.userId)).where(where).orderBy(desc(employersTable.createdAt));
  const ids = rows.map((r) => r.e.id);
  const vs = ids.length ? await db.select().from(employerVerificationsTable).where(inArray(employerVerificationsTable.employerId, ids)).orderBy(desc(employerVerificationsTable.submittedAt), desc(employerVerificationsTable.id)) : [];
  return rows.map(({ e, u, opps }) => {
    const v = vs.find((x) => x.employerId === e.id);
    return {
      id: e.id, userId: e.userId, businessName: e.businessName, employerName: e.employerName, email: u.email, phone: u.phone, location: e.location, businessType: e.businessType,
      description: e.description, verificationStatus: e.verificationStatus, verificationInfo: v?.submittedInfo ?? "", evidenceUrl: v?.evidenceUrl ?? null, reviewNotes: v?.reviewNotes ?? null,
      submittedAt: iso(v?.submittedAt), opportunityCount: opps,
    };
  });
}

router.get("/admin/employers", async (req, res) => {
  const q = parse(ListAdminEmployersQueryParams, req.query);
  res.json(await adminEmployers(q.status ? eq(employersTable.verificationStatus, q.status as "Pending" | "Verified" | "Rejected") : undefined));
});

router.put("/admin/employers/:id/verify", async (req, res) => {
  const admin = me(req);
  const { id } = parse(VerifyEmployerParams, req.params);
  const b = parse(VerifyEmployerBody, req.body);
  const [e] = await db.select().from(employersTable).where(eq(employersTable.id, id));
  if (!e) throw new HttpError(404, "Employer not found.");
  const notes = optionalText(b.notes, "Notes", 1000) ?? "";
  if (b.status === "Rejected" && !notes) throw new HttpError(400, "Add a short note explaining the decision so the employer knows what to fix.");
  const [latest] = await db.select().from(employerVerificationsTable).where(eq(employerVerificationsTable.employerId, id)).orderBy(desc(employerVerificationsTable.submittedAt), desc(employerVerificationsTable.id)).limit(1);
  if (latest) await db.update(employerVerificationsTable).set({ status: b.status, reviewNotes: notes || null, reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(employerVerificationsTable.id, latest.id));
  else await db.insert(employerVerificationsTable).values({ employerId: id, status: b.status, reviewNotes: notes || null, reviewedBy: admin.id, reviewedAt: new Date() });
  await db.update(employersTable).set({ verificationStatus: b.status }).where(eq(employersTable.id, id));
  await notify(e.userId, "employer_verification", b.status === "Verified" ? "Employer verification approved" : "Employer verification not approved", b.status === "Verified" ? "You can now post opportunities. Verification improves trust but does not guarantee safety." : notes, "/employer/profile");
  res.json((await adminEmployers(eq(employersTable.id, id)))[0]);
});

// ---- opportunities -----------------------------------------------------------------
async function adminOpps(where?: ReturnType<typeof and>) {
  const rows = await db
    .select({ o: opportunitiesTable, e: employersTable, apps: sql<number>`(select count(*)::int from applications a where a.opportunity_id = ${opportunitiesTable.id})` })
    .from(opportunitiesTable).innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId)).where(where).orderBy(desc(opportunitiesTable.createdAt));
  return rows.map(({ o, e, apps }) => ({ id: o.id, title: o.title, businessName: e.businessName, employerVerified: e.verificationStatus === "Verified", status: o.status, category: o.category, location: o.location, applicantCount: apps, createdAt: o.createdAt.toISOString() }));
}

router.get("/admin/opportunities", async (_req, res) => {
  res.json(await adminOpps());
});

async function setOppStatus(id: number, status: "open" | "closed" | "removed") {
  const [o] = await db.select({ o: opportunitiesTable, userId: employersTable.userId }).from(opportunitiesTable).innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId)).where(eq(opportunitiesTable.id, id));
  if (!o) throw new HttpError(404, "Opportunity not found.");
  await db.update(opportunitiesTable).set({ status, updatedAt: new Date() }).where(eq(opportunitiesTable.id, id));
  if (status === "removed") await notify(o.userId, "report_update", `Opportunity removed: ${o.o.title}`, "SakhiSetu moderation removed this opportunity. Contact support if you believe this was a mistake.", "/employer/opportunities");
}

router.put("/admin/opportunities/:id/status", async (req, res) => {
  const { id } = parse(UpdateAdminOpportunityStatusParams, req.params);
  const { status } = parse(UpdateAdminOpportunityStatusBody, req.body);
  if (!["open", "closed", "removed"].includes(status)) throw new HttpError(400, "Status must be open, closed or removed.");
  await setOppStatus(id, status as "open" | "closed" | "removed");
  res.json((await adminOpps(eq(opportunitiesTable.id, id)))[0]);
});

// ---- reports -----------------------------------------------------------------------
router.get("/admin/reports", async (req, res) => {
  const q = parse(ListAdminReportsQueryParams, req.query);
  const rows = await db.select({ r: reportsTable, name: usersTable.name }).from(reportsTable).innerJoin(usersTable, eq(usersTable.id, reportsTable.reporterId))
    .where(q.status ? eq(reportsTable.status, q.status as "Open") : undefined).orderBy(desc(reportsTable.createdAt));
  res.json(await Promise.all(rows.map(({ r, name }) => reportDto(r, name))));
});

router.put("/admin/reports/:id", async (req, res) => {
  const admin = me(req);
  const { id } = parse(ReviewReportParams, req.params);
  const b = parse(ReviewReportBody, req.body);
  const [r] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!r) throw new HttpError(404, "Report not found.");
  const note = optionalText(b.resolutionNote, "Resolution note", 1000) ?? "";
  if ((b.status === "Resolved" || b.status === "Rejected") && !note) throw new HttpError(400, "Add a short resolution note.");
  if (b.action === "remove_opportunity") {
    if (r.targetType !== "opportunity") throw new HttpError(400, "Only opportunity reports can remove an opportunity.");
    await setOppStatus(r.targetId, "removed");
  } else if (b.action === "suspend_user") {
    if (r.targetType !== "employer") throw new HttpError(400, "Only employer reports can suspend an account.");
    const [e] = await db.select({ userId: employersTable.userId }).from(employersTable).where(eq(employersTable.id, r.targetId));
    if (!e) throw new HttpError(404, "Employer not found.");
    await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, e.userId));
    await db.delete(sessionsTable).where(eq(sessionsTable.userId, e.userId));
  }
  const [updated] = await db.update(reportsTable).set({ status: b.status, resolutionNote: note || null, resolvedBy: admin.id, updatedAt: new Date() }).where(eq(reportsTable.id, id)).returning();
  await notify(r.reporterId, "report_update", `Your report is now: ${b.status}`, note || "An administrator is looking into it.", "/reports");
  res.json(await reportDto(updated!));
});

// ---- skill evidence ------------------------------------------------------------------
router.get("/admin/skill-evidence", async (_req, res) => {
  const rows = await db.select({ us: userSkillsTable, s: skillsTable, u: usersTable }).from(userSkillsTable).innerJoin(skillsTable, eq(skillsTable.id, userSkillsTable.skillId)).innerJoin(usersTable, eq(usersTable.id, userSkillsTable.userId))
    .where(eq(userSkillsTable.verificationStatus, "Pending Review")).orderBy(asc(userSkillsTable.updatedAt));
  res.json(rows.map(({ us, s, u }) => ({ id: us.id, userId: u.id, userName: u.name, skillName: s.name, evidenceType: us.evidenceType, evidenceUrl: us.evidenceUrl, evidenceNote: us.evidenceNote, status: us.verificationStatus })));
});

router.put("/admin/skill-evidence/:id", async (req, res) => {
  const { id } = parse(ReviewSkillEvidenceParams, req.params);
  const b = parse(ReviewSkillEvidenceBody, req.body);
  const [row] = await db.select({ us: userSkillsTable, s: skillsTable }).from(userSkillsTable).innerJoin(skillsTable, eq(skillsTable.id, userSkillsTable.skillId)).where(eq(userSkillsTable.id, id));
  if (!row) throw new HttpError(404, "Skill record not found.");
  const notes = optionalText(b.notes, "Notes", 1000) ?? "";
  if (b.status === "Rejected" && !notes) throw new HttpError(400, "Add a short note so the learner knows how to improve her evidence.");
  await db.update(userSkillsTable).set({ verificationStatus: b.status, verifiedVia: b.status === "Verified" ? "admin_review" : null, reviewNotes: notes || null, updatedAt: new Date() }).where(eq(userSkillsTable.id, id));
  await notify(row.us.userId, "skill_verification", b.status === "Verified" ? `Skill verified: ${row.s.name}` : `Skill evidence not accepted: ${row.s.name}`, notes || "A reviewer checked your evidence.", "/skills");
  await refreshScore(row.us.userId, b.status === "Verified" ? `Skill verified: ${row.s.name}` : `Skill evidence reviewed: ${row.s.name}`);
  res.json({ ok: true });
});

// ---- courses -------------------------------------------------------------------------
async function adminCourse(id: number) {
  const [c] = await db.select().from(coursesTable).where(eq(coursesTable.id, id));
  if (!c) throw new HttpError(404, "Course not found.");
  const lessons = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.courseId, id)).orderBy(asc(courseLessonsTable.position), asc(courseLessonsTable.id));
  const questions = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.courseId, id)).orderBy(asc(assessmentQuestionsTable.position), asc(assessmentQuestionsTable.id));
  return {
    id: c.id, title: c.title, category: c.category, difficulty: c.difficulty, duration: c.duration, description: c.description, skillsGained: c.skillsGained, verifiesSkills: c.verifiesSkills, passingScore: c.passingScore, published: c.published,
    lessons: lessons.map((l) => ({ id: l.id, position: l.position, title: l.title, description: l.description, videoUrl: l.videoUrl, durationMinutes: l.durationMinutes, content: l.content, objectives: l.objectives, resources: l.resources })),
    questions: questions.map((q) => ({ id: q.id, position: q.position, type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, keywords: q.keywords, minKeywords: q.minKeywords, explanation: q.explanation, skillName: q.skillName })),
  };
}

const list = (v?: string[]) => (v ?? []).map((s) => s.trim()).filter(Boolean);

function courseValues(b: ReturnType<typeof CreateAdminCourseBody.parse>) {
  return {
    title: requireText(b.title, "Title", 120), category: requireText(b.category, "Category", 60), difficulty: optionalText(b.difficulty, "Difficulty", 40) || "Beginner", duration: optionalText(b.duration, "Duration", 40) ?? "",
    description: optionalText(b.description, "Description", 1000) ?? "", skillsGained: list(b.skillsGained), verifiesSkills: list(b.verifiesSkills), passingScore: b.passingScore ?? 70, published: b.published ?? true,
  };
}

router.get("/admin/courses", async (_req, res) => {
  const ids = await db.select({ id: coursesTable.id }).from(coursesTable).orderBy(asc(coursesTable.id));
  res.json(await Promise.all(ids.map((c) => adminCourse(c.id))));
});

router.post("/admin/courses", async (req, res) => {
  const v = courseValues(parse(CreateAdminCourseBody, req.body));
  for (const s of v.verifiesSkills) await ensureSkill(s, v.category);
  const [c] = await db.insert(coursesTable).values(v).returning({ id: coursesTable.id });
  res.status(201).json(await adminCourse(c!.id));
});

router.put("/admin/courses/:id", async (req, res) => {
  const { id } = parse(UpdateAdminCourseParams, req.params);
  await adminCourse(id);
  const v = courseValues(parse(UpdateAdminCourseBody, req.body));
  for (const s of v.verifiesSkills) await ensureSkill(s, v.category);
  await db.update(coursesTable).set(v).where(eq(coursesTable.id, id));
  res.json(await adminCourse(id));
});

function lessonValues(b: ReturnType<typeof CreateAdminLessonBody.parse>) {
  const videoUrl = b.videoUrl?.trim() || null;
  if (videoUrl && !isHttpUrl(videoUrl)) throw new HttpError(400, "Video link must start with http:// or https://");
  const resources = (b.resources ?? []).map((r) => ({ title: requireText(r.title, "Resource title", 120), url: r.url.trim() }));
  if (resources.some((r) => !isHttpUrl(r.url))) throw new HttpError(400, "Resource links must start with http:// or https://");
  return { title: requireText(b.title, "Lesson title", 160), description: optionalText(b.description, "Description", 1000) ?? "", videoUrl, durationMinutes: Math.max(1, Math.min(600, Math.round(b.durationMinutes ?? 10))), content: optionalText(b.content, "Content", 20000) ?? "", objectives: list(b.objectives), resources };
}

router.post("/admin/courses/:id/lessons", async (req, res) => {
  const { id } = parse(CreateAdminLessonParams, req.params);
  await adminCourse(id);
  const b = parse(CreateAdminLessonBody, req.body);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${courseLessonsTable.position}), 0)::int` }).from(courseLessonsTable).where(eq(courseLessonsTable.courseId, id));
  await db.insert(courseLessonsTable).values({ ...lessonValues(b), courseId: id, position: b.position ?? max + 1 });
  res.status(201).json(await adminCourse(id));
});

router.put("/admin/lessons/:id", async (req, res) => {
  const { id } = parse(UpdateAdminLessonParams, req.params);
  const b = parse(UpdateAdminLessonBody, req.body);
  const [l] = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.id, id));
  if (!l) throw new HttpError(404, "Lesson not found.");
  await db.update(courseLessonsTable).set({ ...lessonValues(b), position: b.position ?? l.position }).where(eq(courseLessonsTable.id, id));
  res.json(await adminCourse(l.courseId));
});

router.delete("/admin/lessons/:id", async (req, res) => {
  const { id } = parse(DeleteAdminLessonParams, req.params);
  const [l] = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.id, id));
  if (!l) throw new HttpError(404, "Lesson not found.");
  await db.delete(courseLessonsTable).where(eq(courseLessonsTable.id, id));
  res.json(await adminCourse(l.courseId));
});

function questionValues(b: ReturnType<typeof CreateAdminQuestionBody.parse>) {
  const options = list(b.options);
  const keywords = list(b.keywords);
  let correct = (b.correctAnswer ?? "").trim();
  if (b.type === "multiple_choice") {
    if (options.length < 2) throw new HttpError(400, "Multiple-choice questions need at least two options.");
    if (!/^\d+$/.test(correct) || Number(correct) >= options.length) throw new HttpError(400, "Choose which option is correct.");
  } else if (b.type === "true_false") {
    correct = correct.toLowerCase();
    if (correct !== "true" && correct !== "false") throw new HttpError(400, "Choose True or False as the correct answer.");
  } else if (!keywords.length) throw new HttpError(400, "Short-answer questions need at least one accepted keyword.");
  return {
    type: b.type, prompt: requireText(b.prompt, "Question", 500), options: b.type === "multiple_choice" ? options : [], correctAnswer: b.type === "short_answer" ? "" : correct,
    keywords: b.type === "short_answer" ? keywords : [], minKeywords: Math.max(1, Math.min(keywords.length || 1, Math.round(b.minKeywords ?? 1))), explanation: optionalText(b.explanation, "Explanation", 1000) ?? "", skillName: b.skillName?.trim() || null,
  };
}

router.post("/admin/courses/:id/questions", async (req, res) => {
  const { id } = parse(CreateAdminQuestionParams, req.params);
  await adminCourse(id);
  const b = parse(CreateAdminQuestionBody, req.body);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${assessmentQuestionsTable.position}), 0)::int` }).from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.courseId, id));
  await db.insert(assessmentQuestionsTable).values({ ...questionValues(b), courseId: id, position: b.position ?? max + 1 });
  res.status(201).json(await adminCourse(id));
});

router.put("/admin/questions/:id", async (req, res) => {
  const { id } = parse(UpdateAdminQuestionParams, req.params);
  const b = parse(UpdateAdminQuestionBody, req.body);
  const [q] = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.id, id));
  if (!q) throw new HttpError(404, "Question not found.");
  await db.update(assessmentQuestionsTable).set({ ...questionValues(b), position: b.position ?? q.position }).where(eq(assessmentQuestionsTable.id, id));
  res.json(await adminCourse(q.courseId));
});

router.delete("/admin/questions/:id", async (req, res) => {
  const { id } = parse(DeleteAdminQuestionParams, req.params);
  const [q] = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.id, id));
  if (!q) throw new HttpError(404, "Question not found.");
  await db.delete(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.id, id));
  res.json(await adminCourse(q.courseId));
});

export default router;
