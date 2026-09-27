import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CompleteEmployerApplicationParams, CreateEmployerOpportunityBody, GetEmployerOpportunityParams, ListEmployerApplicationsQueryParams,
  UpdateEmployerApplicationStatusBody, UpdateEmployerApplicationStatusParams, UpdateEmployerOpportunityBody, UpdateEmployerOpportunityParams, UpdateEmployerProfileBody,
} from "@workspace/api-zod";
import type { EmployerApplication, EmployerOpportunity } from "@workspace/api-zod";
import {
  applicationEventsTable, applicationsTable, db, employerProfileViewsTable, employerVerificationsTable, employersTable, feedbackTable,
  opportunitiesTable, opportunitySkillsTable, usersTable, type ApplicationStatus,
} from "@workspace/db";
import { me, requireRole } from "../lib/auth";
import { HttpError, isHttpUrl, optionalText, parse, requireText } from "../lib/http";
import { ensureSkill } from "../lib/catalog";
import { learnerCertificates, loadCourseBySkill, loadLearner, loadOpportunities, matchFor, notifyNewMatches } from "../lib/learner";
import { notify } from "../lib/notify";
import { WORK_TYPES } from "./opportunities";

const router: IRouter = Router();
router.use("/employer", requireRole("employer"));

async function myEmployer(req: Parameters<typeof me>[0]) {
  const user = me(req);
  const [e] = await db.select().from(employersTable).where(eq(employersTable.userId, user.id));
  if (!e) throw new HttpError(404, "Employer profile not found.");
  return { user, e };
}

async function profileDto(userId: number) {
  const [row] = await db.select({ e: employersTable, u: usersTable }).from(employersTable).innerJoin(usersTable, eq(usersTable.id, employersTable.userId)).where(eq(employersTable.userId, userId));
  if (!row) throw new HttpError(404, "Employer profile not found.");
  const [v] = await db.select().from(employerVerificationsTable).where(eq(employerVerificationsTable.employerId, row.e.id)).orderBy(desc(employerVerificationsTable.submittedAt), desc(employerVerificationsTable.id)).limit(1);
  return {
    id: row.e.id, businessName: row.e.businessName, employerName: row.e.employerName, email: row.u.email, phone: row.u.phone ?? undefined, location: row.e.location,
    businessType: row.e.businessType, description: row.e.description, verificationStatus: row.e.verificationStatus, verificationInfo: v?.submittedInfo ?? "",
    evidenceUrl: v?.evidenceUrl ?? null, reviewNotes: v?.reviewNotes ?? null, submittedAt: v?.submittedAt.toISOString(), reviewedAt: v?.reviewedAt?.toISOString() ?? null,
  };
}

router.get("/employer/profile", async (req, res) => {
  res.json(await profileDto(me(req).id));
});

router.put("/employer/profile", async (req, res) => {
  const { user, e } = await myEmployer(req);
  const b = parse(UpdateEmployerProfileBody, req.body);
  const patch: Partial<typeof employersTable.$inferInsert> = {};
  if (b.businessName !== undefined) patch.businessName = requireText(b.businessName, "Business name", 120);
  if (b.employerName !== undefined) patch.employerName = requireText(b.employerName, "Employer name", 100);
  if (b.location !== undefined) patch.location = requireText(b.location, "Location", 100);
  if (b.businessType !== undefined) patch.businessType = requireText(b.businessType, "Business type", 100);
  if (b.description !== undefined) patch.description = optionalText(b.description, "Description", 2000) ?? "";
  if (b.phone !== undefined) await db.update(usersTable).set({ phone: requireText(b.phone, "Phone", 20) }).where(eq(usersTable.id, user.id));
  if (b.employerName !== undefined) await db.update(usersTable).set({ name: patch.employerName! }).where(eq(usersTable.id, user.id));

  const current = await profileDto(user.id);
  const newInfo = b.verificationInfo !== undefined ? requireText(b.verificationInfo, "Verification information", 2000) : current.verificationInfo;
  const newEvidence = b.evidenceUrl !== undefined ? b.evidenceUrl?.trim() || null : current.evidenceUrl;
  if (newEvidence && !isHttpUrl(newEvidence)) throw new HttpError(400, "Evidence link must start with http:// or https://");
  // Changing what was verified (identity or evidence) sends the profile back for review.
  const identityChanged = newInfo !== current.verificationInfo || newEvidence !== current.evidenceUrl || (patch.businessName !== undefined && patch.businessName !== current.businessName);
  if (identityChanged) {
    patch.verificationStatus = "Pending";
    await db.insert(employerVerificationsTable).values({ employerId: e.id, status: "Pending", submittedInfo: newInfo, evidenceUrl: newEvidence });
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const a of admins) await notify(a.id, "employer_verification", "Employer verification awaiting review", `${patch.businessName ?? e.businessName} submitted verification details.`, "/admin/employers");
  }
  if (Object.keys(patch).length) await db.update(employersTable).set(patch).where(eq(employersTable.id, e.id));
  res.json(await profileDto(user.id));
});

// ---- opportunities -----------------------------------------------------------
async function employerOpps(employerId: number, oppId?: number): Promise<EmployerOpportunity[]> {
  const rows = await loadOpportunities(oppId ? and(eq(opportunitiesTable.employerId, employerId), eq(opportunitiesTable.id, oppId)) : eq(opportunitiesTable.employerId, employerId));
  const counts = rows.length ? await db.select({ id: applicationsTable.opportunityId, n: sql<number>`count(*)::int` }).from(applicationsTable).where(inArray(applicationsTable.opportunityId, rows.map((r) => r.id))).groupBy(applicationsTable.opportunityId) : [];
  return rows.map((o) => ({
    id: o.id, title: o.title, description: o.description, responsibilities: o.responsibilities, category: o.category, location: o.location, workType: o.workType,
    availability: o.availability, experience: o.experience, experienceYears: o.experienceYears, compensation: o.compensation, deadline: o.deadline, status: o.status,
    requiredSkills: o.requiredSkills, preferredSkills: o.preferredSkills, applicantCount: counts.find((c) => c.id === o.id)?.n ?? 0, createdAt: o.createdAt.toISOString(),
  }));
}

function cleanOppInput(b: ReturnType<typeof CreateEmployerOpportunityBody.parse>) {
  if (!WORK_TYPES.includes(b.workType)) throw new HttpError(400, "Choose a valid work type.");
  const required = [...new Set(b.requiredSkills.map((s) => s.trim()).filter(Boolean))];
  if (!required.length) throw new HttpError(400, "Add at least one required skill.");
  if (required.length > 15) throw new HttpError(400, "Add up to 15 required skills.");
  const preferred = [...new Set((b.preferredSkills ?? []).map((s) => s.trim()).filter(Boolean))].filter((s) => !required.some((r) => r.toLowerCase() === s.toLowerCase())).slice(0, 15);
  const years = Math.max(0, Math.min(40, Math.round(b.experienceYears ?? 0)));
  if (b.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(b.deadline)) throw new HttpError(400, "Deadline must be a date (YYYY-MM-DD).");
  return {
    required, preferred,
    values: {
      title: requireText(b.title, "Title", 120), description: requireText(b.description, "Description", 3000), responsibilities: optionalText(b.responsibilities, "Responsibilities", 3000) ?? "",
      category: requireText(b.category, "Category", 60), location: requireText(b.location, "Location", 100), workType: b.workType,
      availability: optionalText(b.availability, "Availability", 200) ?? "", experienceYears: years,
      experience: optionalText(b.experience, "Experience", 200) || (years ? `${years}+ year${years === 1 ? "" : "s"} preferred` : "No experience required"),
      compensation: optionalText(b.compensation, "Compensation", 120) ?? "", deadline: b.deadline || null,
    },
  };
}

async function writeSkills(oppId: number, required: string[], preferred: string[]) {
  await db.delete(opportunitySkillsTable).where(eq(opportunitySkillsTable.opportunityId, oppId));
  for (const [names, kind] of [[required, "required"], [preferred, "preferred"]] as const) {
    for (const name of names) {
      const skill = await ensureSkill(name, "Practical");
      await db.insert(opportunitySkillsTable).values({ opportunityId: oppId, skillId: skill.id, kind }).onConflictDoNothing();
    }
  }
}

router.get("/employer/opportunities", async (req, res) => {
  const { e } = await myEmployer(req);
  res.json(await employerOpps(e.id));
});

router.get("/employer/opportunities/:id", async (req, res) => {
  const { e } = await myEmployer(req);
  const { id } = parse(GetEmployerOpportunityParams, req.params);
  const [o] = await employerOpps(e.id, id);
  if (!o) throw new HttpError(404, "Opportunity not found.");
  res.json(o);
});

router.post("/employer/opportunities", async (req, res) => {
  const { e } = await myEmployer(req);
  if (e.verificationStatus !== "Verified") throw new HttpError(403, e.verificationStatus === "Pending" ? "Your employer verification is still pending. You can post opportunities once an admin approves it." : "Your verification was not approved. Update your verification details to request another review.");
  const { required, preferred, values } = cleanOppInput(parse(CreateEmployerOpportunityBody, req.body));
  if (values.deadline && values.deadline < new Date().toISOString().slice(0, 10)) throw new HttpError(400, "Deadline cannot be in the past.");
  const [o] = await db.insert(opportunitiesTable).values({ ...values, employerId: e.id, status: "open" }).returning({ id: opportunitiesTable.id });
  await writeSkills(o!.id, required, preferred);
  // Tell women who now have a strong match (rule-based; capped for safety).
  const women = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.role, "woman"), eq(usersTable.status, "active"))).limit(500);
  for (const w of women) await notifyNewMatches(w.id).catch(() => undefined);
  const [created] = await employerOpps(e.id, o!.id);
  res.status(201).json(created);
});

router.put("/employer/opportunities/:id", async (req, res) => {
  const { e } = await myEmployer(req);
  const { id } = parse(UpdateEmployerOpportunityParams, req.params);
  const body = parse(UpdateEmployerOpportunityBody, req.body);
  const [existing] = await employerOpps(e.id, id);
  if (!existing) throw new HttpError(404, "Opportunity not found.");
  if (existing.status === "removed") throw new HttpError(403, "This opportunity was removed by SakhiSetu moderation and cannot be edited.");
  const { required, preferred, values } = cleanOppInput(body);
  const status = body.status ?? existing.status;
  if (status === "open" && existing.status !== "open" && e.verificationStatus !== "Verified") throw new HttpError(403, "Only verified employers can reopen opportunities.");
  await db.update(opportunitiesTable).set({ ...values, status: status as "open" | "closed", updatedAt: new Date() }).where(eq(opportunitiesTable.id, id));
  await writeSkills(id, required, preferred);
  res.json((await employerOpps(e.id, id))[0]);
});

// ---- applicants ---------------------------------------------------------------
const CONTACT_VISIBLE: ApplicationStatus[] = ["Interview", "Selected"];

async function applicantDtos(employerId: number, filters: { opportunityId?: number; status?: string; applicationId?: number } = {}): Promise<EmployerApplication[]> {
  const conds = [eq(opportunitiesTable.employerId, employerId)];
  if (filters.opportunityId) conds.push(eq(applicationsTable.opportunityId, filters.opportunityId));
  if (filters.status) conds.push(eq(applicationsTable.status, filters.status as ApplicationStatus));
  if (filters.applicationId) conds.push(eq(applicationsTable.id, filters.applicationId));
  const rows = await db.select({ a: applicationsTable, o: opportunitiesTable }).from(applicationsTable).innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId)).where(and(...conds)).orderBy(desc(applicationsTable.appliedAt));
  if (!rows.length) return [];
  const oppRows = await loadOpportunities(eq(opportunitiesTable.employerId, employerId));
  const courseBySkill = await loadCourseBySkill();
  const given = await db.select({ appId: feedbackTable.applicationId }).from(feedbackTable).where(and(inArray(feedbackTable.applicationId, rows.map((r) => r.a.id)), eq(feedbackTable.direction, "employer_to_woman")));
  const givenSet = new Set(given.map((g) => g.appId));
  const out: EmployerApplication[] = [];
  for (const { a, o } of rows) {
    const learner = await loadLearner(a.userId);
    const opp = oppRows.find((x) => x.id === o.id)!;
    const m = matchFor(learner, opp, courseBySkill);
    const relevantNames = new Set([...opp.requiredSkills, ...opp.preferredSkills].map((s) => s.toLowerCase()));
    const certs = await learnerCertificates(a.userId);
    const fb = await db.select({ rating: feedbackTable.rating, comment: feedbackTable.comment }).from(feedbackTable).where(and(eq(feedbackTable.toUserId, a.userId), eq(feedbackTable.direction, "employer_to_woman"))).orderBy(desc(feedbackTable.createdAt)).limit(20);
    const [u] = await db.select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, a.userId));
    out.push({
      id: a.id, opportunityId: o.id, opportunityTitle: o.title,
      // Privacy: first name only until the employer moves the candidate to Interview / Selected.
      applicantLabel: `${learner.name.split(" ")[0]} · Applicant #${a.id}`,
      status: a.status, matchPercent: m.match, reasons: m.reasons, gaps: m.skillGap,
      relevantSkills: learner.skills.filter((s) => relevantNames.has(s.name.toLowerCase())).map((s) => ({ name: s.name, verified: s.verified, level: s.level, yearsExperience: s.years })),
      verifiedSkills: learner.skills.filter((s) => s.verified).map((s) => s.name),
      certificates: certs.map(({ c, course }) => ({ title: course.title, issuedAt: c.issuedAt.toISOString() })),
      availability: learner.profile.availability, workPreferences: learner.profile.workPreferences,
      feedbackSummary: { count: fb.length, average: fb.length ? Math.round((fb.reduce((t, f) => t + f.rating, 0) / fb.length) * 10) / 10 : null, comments: fb.filter((f) => f.comment).slice(0, 3).map((f) => f.comment) },
      coverNote: a.coverNote, appliedAt: a.appliedAt.toISOString(), updatedAt: a.updatedAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
      feedbackGiven: givenSet.has(a.id),
      contact: CONTACT_VISIBLE.includes(a.status) && u ? { name: u.name, email: u.email, phone: u.phone } : null,
    });
  }
  return out;
}

router.get("/employer/applications", async (req, res) => {
  const { e } = await myEmployer(req);
  const q = parse(ListEmployerApplicationsQueryParams, req.query);
  res.json(await applicantDtos(e.id, { opportunityId: q.opportunityId, status: q.status }));
});

router.put("/employer/applications/:id/status", async (req, res) => {
  const { user, e } = await myEmployer(req);
  const { id } = parse(UpdateEmployerApplicationStatusParams, req.params);
  const b = parse(UpdateEmployerApplicationStatusBody, req.body);
  const [row] = await db.select({ a: applicationsTable, o: opportunitiesTable }).from(applicationsTable).innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId)).where(and(eq(applicationsTable.id, id), eq(opportunitiesTable.employerId, e.id)));
  if (!row) throw new HttpError(404, "Application not found.");
  if (row.a.status === "Withdrawn") throw new HttpError(409, "The candidate withdrew this application.");
  if (row.a.completedAt) throw new HttpError(409, "This work is already marked completed.");
  if (row.a.status === b.status) throw new HttpError(409, `Application is already "${b.status}".`);
  const note = optionalText(b.note, "Note", 500) ?? "";
  await db.update(applicationsTable).set({ status: b.status, updatedAt: new Date() }).where(eq(applicationsTable.id, id));
  await db.insert(applicationEventsTable).values({ applicationId: id, status: b.status, note, actorId: user.id });
  await notify(row.a.userId, "application_status", `Application update: ${b.status}`, `${row.o.title} at ${e.businessName}${note ? ` — ${note}` : ""}`, "/applications");
  res.json((await applicantDtos(e.id, { applicationId: id }))[0]);
});

router.post("/employer/applications/:id/complete", async (req, res) => {
  const { user, e } = await myEmployer(req);
  const { id } = parse(CompleteEmployerApplicationParams, req.params);
  const [row] = await db.select({ a: applicationsTable, o: opportunitiesTable }).from(applicationsTable).innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId)).where(and(eq(applicationsTable.id, id), eq(opportunitiesTable.employerId, e.id)));
  if (!row) throw new HttpError(404, "Application not found.");
  if (row.a.status !== "Selected") throw new HttpError(409, "Only selected candidates can be marked as having completed work.");
  if (row.a.completedAt) throw new HttpError(409, "Already marked as completed.");
  await db.update(applicationsTable).set({ completedAt: new Date(), updatedAt: new Date() }).where(eq(applicationsTable.id, id));
  await db.insert(applicationEventsTable).values({ applicationId: id, status: "Selected", note: "Work marked as completed", actorId: user.id });
  await notify(row.a.userId, "application_status", `Work completed: ${row.o.title}`, "Share feedback about your experience, and see what your employer shared.", "/feedback");
  res.json((await applicantDtos(e.id, { applicationId: id }))[0]);
});

router.get("/employer/dashboard", async (req, res) => {
  const { e } = await myEmployer(req);
  const [opps] = await db.select({ n: sql<number>`count(*)::int` }).from(opportunitiesTable).where(and(eq(opportunitiesTable.employerId, e.id), eq(opportunitiesTable.status, "open")));
  const counts = await db.select({ status: applicationsTable.status, n: sql<number>`count(*)::int` }).from(applicationsTable).innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId)).where(eq(opportunitiesTable.employerId, e.id)).groupBy(applicationsTable.status);
  const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
  const [views] = await db.select({ n: sql<number>`count(*)::int` }).from(employerProfileViewsTable).where(eq(employerProfileViewsTable.employerId, e.id));
  res.json({
    verificationStatus: e.verificationStatus, activeOpportunities: opps?.n ?? 0, totalApplications: counts.reduce((t, x) => t + x.n, 0), shortlisted: c("Shortlisted"),
    interviews: c("Interview"), selected: c("Selected"), profileViews: views?.n ?? 0, recentApplications: (await applicantDtos(e.id)).slice(0, 5),
  });
});

export default router;
