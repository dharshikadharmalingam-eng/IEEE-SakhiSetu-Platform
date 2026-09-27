import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ApplyToOpportunityBody, GetApplicationParams, GetOpportunityParams, ListOpportunitiesQueryParams } from "@workspace/api-zod";
import type { Application, MatchExplanation } from "@workspace/api-zod";
import { applicationEventsTable, applicationsTable, db, employerProfileViewsTable, employersTable, feedbackTable, opportunitiesTable, savedOpportunitiesTable, type ApplicationStatus } from "@workspace/db";
import { me, requireRole } from "../lib/auth";
import { HttpError, optionalText, parse } from "../lib/http";
import { availabilityTags } from "../lib/matching";
import { learnerExtras, loadCourseBySkill, loadLearner, loadOpportunities, matchFor, rankedMatches, toOpportunityDto, visibleToWomen, type OppRow } from "../lib/learner";
import { notify } from "../lib/notify";

const router: IRouter = Router();
router.use(["/opportunities", "/matches", "/applications"], requireRole("woman"));

export const WITHDRAWABLE: ApplicationStatus[] = ["Applied", "Under Review", "Shortlisted", "Interview"];
export const CATEGORIES = ["Childcare", "Elderly Care", "Cooking", "Tailoring", "Housekeeping", "Digital Work", "Virtual Assistance", "Software Testing", "Web Development", "Data Analytics", "Canva Design", "Other"];
export const WORK_TYPES = ["Local", "Remote", "Part-time", "Full-time", "Flexible"];
export const AVAILABILITY_OPTIONS = ["Mornings", "Afternoons", "Evenings", "Weekdays", "Weekends", "Flexible"];

const NEXT_STEP: Record<string, string> = {
  Applied: "Your application has been sent. The employer will review it.",
  "Under Review": "The employer is reviewing your application.",
  Shortlisted: "You have been shortlisted. Watch for a message from the employer.",
  Interview: "Interview stage. Confirm arrangements and follow safe meeting practices.",
  Selected: "You have been selected. Confirm the details with the employer.",
  Rejected: "Not selected this time. Explore other matches or build a skill gap.",
  Withdrawn: "You withdrew this application.",
};

export function applicationDto(a: typeof applicationsTable.$inferSelect, opportunity: string, employer: string, extra: { history?: Application["history"]; feedbackGiven?: boolean } = {}): Application {
  const done = Boolean(a.completedAt);
  return {
    id: a.id, opportunityId: a.opportunityId, opportunity, employer, dateApplied: a.appliedAt.toISOString(), status: a.status,
    nextStep: a.status === "Selected" && done ? (extra.feedbackGiven ? "Work completed. Thank you for sharing feedback." : "Work completed. Share feedback about your experience.") : NEXT_STEP[a.status] ?? "",
    matchPercent: a.matchPercent, coverNote: a.coverNote, updatedAt: a.updatedAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
    history: extra.history, feedbackDue: done && !extra.feedbackGiven, feedbackGiven: Boolean(extra.feedbackGiven),
  };
}

async function myApplications(userId: number, only?: number) {
  const rows = await db
    .select({ a: applicationsTable, o: opportunitiesTable, e: employersTable })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId))
    .where(only ? and(eq(applicationsTable.userId, userId), eq(applicationsTable.id, only)) : eq(applicationsTable.userId, userId))
    .orderBy(desc(applicationsTable.appliedAt));
  const given = rows.length ? await db.select({ appId: feedbackTable.applicationId }).from(feedbackTable).where(and(inArray(feedbackTable.applicationId, rows.map((r) => r.a.id)), eq(feedbackTable.direction, "woman_to_employer"))) : [];
  const givenSet = new Set(given.map((g) => g.appId));
  return rows.map(({ a, o, e }) => applicationDto(a, o.title, e.businessName, { feedbackGiven: givenSet.has(a.id) }));
}

// ---- search ---------------------------------------------------------------
router.get("/opportunities/filters", async (_req, res) => {
  const opps = await loadOpportunities(visibleToWomen());
  res.json({
    locations: [...new Set(opps.map((o) => o.location))].sort(),
    categories: [...new Set([...CATEGORIES.filter((c) => c !== "Other"), ...opps.map((o) => o.category), "Other"])],
    workTypes: WORK_TYPES,
    skills: [...new Set(opps.flatMap((o) => [...o.requiredSkills, ...o.preferredSkills]))].sort(),
    availability: AVAILABILITY_OPTIONS,
  });
});

router.get("/opportunities", async (req, res) => {
  const user = me(req);
  const q = parse(ListOpportunitiesQueryParams, req.query);
  const savedOnly = req.query["saved"] === "true";
  const learner = await loadLearner(user.id);
  const [ranked, extras] = await Promise.all([rankedMatches(learner), learnerExtras(user.id)]);
  const has = (a: string, b?: string) => !b || a.toLowerCase().includes(b.trim().toLowerCase());
  const out = ranked.filter(({ opp }) => {
    if (savedOnly && !extras.saved?.has(opp.id)) return false;
    if (q.q && !`${opp.title} ${opp.businessName} ${opp.category} ${opp.description} ${[...opp.requiredSkills, ...opp.preferredSkills].join(" ")}`.toLowerCase().includes(q.q.trim().toLowerCase())) return false;
    if (!has(opp.location, q.location)) return false;
    if (q.workType && opp.workType.toLowerCase() !== q.workType.toLowerCase()) return false;
    if (q.category && opp.category.toLowerCase() !== q.category.toLowerCase()) return false;
    if (q.skill && ![...opp.requiredSkills, ...opp.preferredSkills].some((s) => s.toLowerCase() === q.skill!.trim().toLowerCase())) return false;
    if (q.maxExperience !== undefined && opp.experienceYears > q.maxExperience) return false;
    if (q.availability) {
      const tags = availabilityTags(opp.availability);
      const want = q.availability.toLowerCase().replace(/s$/, "");
      if (tags.size && !tags.has("flexible") && !tags.has(want)) return false;
    }
    return true;
  });
  res.json(out.map(({ opp, m }) => toOpportunityDto(opp, m, extras)));
});

router.get("/matches", async (req, res) => {
  const user = me(req);
  const [ranked, extras] = await Promise.all([rankedMatches(await loadLearner(user.id)), learnerExtras(user.id)]);
  res.json(ranked.map(({ opp, m }) => toOpportunityDto(opp, m, extras)));
});

/** Load one opportunity for a woman: visible ones, or any she has already applied to. */
async function oppForWoman(userId: number, id: number): Promise<OppRow> {
  const [opp] = await loadOpportunities(eq(opportunitiesTable.id, id));
  if (!opp || opp.status === "removed") throw new HttpError(404, "Opportunity not found.");
  const [visible] = await loadOpportunities(and(eq(opportunitiesTable.id, id), visibleToWomen()));
  if (visible) return visible;
  const [app] = await db.select({ id: applicationsTable.id }).from(applicationsTable).where(and(eq(applicationsTable.userId, userId), eq(applicationsTable.opportunityId, id)));
  if (!app) throw new HttpError(404, "Opportunity not found.");
  return opp;
}

router.get("/opportunities/:id", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetOpportunityParams, req.params);
  const opp = await oppForWoman(user.id, id);
  const [learner, courseBySkill, extras] = await Promise.all([loadLearner(user.id), loadCourseBySkill(), learnerExtras(user.id)]);
  await db.insert(employerProfileViewsTable).values({ employerId: opp.employerId, viewerId: user.id, viewedOn: new Date().toISOString().slice(0, 10) }).onConflictDoNothing();
  res.json(toOpportunityDto(opp, matchFor(learner, opp, courseBySkill), extras));
});

router.get("/opportunities/:id/match-explanation", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetOpportunityParams, req.params);
  const opp = await oppForWoman(user.id, id);
  const m = matchFor(await loadLearner(user.id), opp, await loadCourseBySkill());
  const body: MatchExplanation = {
    match: m.match,
    reasons: m.reasons.length ? m.reasons : ["No strong matches yet — the skill gaps below show where to start."],
    gaps: m.skillGap,
    recommendedNextStep: m.recommendedNextStep,
    scoring: m.components.map((c) => ({ key: c.key, label: c.label, value: c.value, earned: c.earned, status: c.status, detail: c.detail })),
    matchingSkills: m.matchingSkills, missingSkills: m.missingSkills, recommendedCourse: m.recommendedCourse,
    note: "Match % shows how well you fit this one opportunity using the rules above. It is separate from your Sakhi Score, which is your overall readiness. Neither guarantees a job or income.",
  };
  res.json(body);
});

router.post("/opportunities/:id/save", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetOpportunityParams, req.params);
  const opp = await oppForWoman(user.id, id);
  await db.insert(savedOpportunitiesTable).values({ userId: user.id, opportunityId: id }).onConflictDoNothing();
  res.json(toOpportunityDto(opp, matchFor(await loadLearner(user.id), opp, await loadCourseBySkill()), await learnerExtras(user.id)));
});

router.delete("/opportunities/:id/save", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetOpportunityParams, req.params);
  const opp = await oppForWoman(user.id, id);
  await db.delete(savedOpportunitiesTable).where(and(eq(savedOpportunitiesTable.userId, user.id), eq(savedOpportunitiesTable.opportunityId, id)));
  res.json(toOpportunityDto(opp, matchFor(await loadLearner(user.id), opp, await loadCourseBySkill()), await learnerExtras(user.id)));
});

router.post("/opportunities/:id/apply", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetOpportunityParams, req.params);
  const body = parse(ApplyToOpportunityBody, req.body ?? {});
  const [opp] = await loadOpportunities(and(eq(opportunitiesTable.id, id), visibleToWomen()));
  if (!opp) throw new HttpError(404, "This opportunity is no longer open for applications.");
  const coverNote = optionalText(body.coverNote, "Note", 1000) ?? "";
  const learner = await loadLearner(user.id);
  const match = matchFor(learner, opp, await loadCourseBySkill()).match;
  const [existing] = await db.select().from(applicationsTable).where(and(eq(applicationsTable.userId, user.id), eq(applicationsTable.opportunityId, id)));
  let appId: number;
  if (existing) {
    if (existing.status !== "Withdrawn") throw new HttpError(409, "You have already applied for this opportunity.");
    await db.update(applicationsTable).set({ status: "Applied", matchPercent: match, coverNote, appliedAt: new Date(), updatedAt: new Date(), completedAt: null }).where(eq(applicationsTable.id, existing.id));
    appId = existing.id;
  } else {
    const [a] = await db.insert(applicationsTable).values({ opportunityId: id, userId: user.id, matchPercent: match, coverNote }).returning({ id: applicationsTable.id });
    appId = a!.id;
  }
  await db.insert(applicationEventsTable).values({ applicationId: appId, status: "Applied", note: existing ? "Re-applied after withdrawing" : "Application submitted", actorId: user.id });
  const [emp] = await db.select({ userId: employersTable.userId }).from(employersTable).where(eq(employersTable.id, opp.employerId));
  if (emp) await notify(emp.userId, "new_application", `New application for ${opp.title}`, `A candidate with a ${match}% match applied.`, "/employer/applications");
  const [row] = await myApplications(user.id, appId);
  res.status(201).json(row);
});

// ---- applications ---------------------------------------------------------
router.get("/applications", async (req, res) => {
  res.json(await myApplications(me(req).id));
});

router.get("/applications/:id", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetApplicationParams, req.params);
  const [row] = await myApplications(user.id, id);
  if (!row) throw new HttpError(404, "Application not found.");
  const events = await db.select().from(applicationEventsTable).where(eq(applicationEventsTable.applicationId, id)).orderBy(applicationEventsTable.createdAt, applicationEventsTable.id);
  res.json({ ...row, history: events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })) });
});

router.post("/applications/:id/withdraw", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetApplicationParams, req.params);
  const [a] = await db.select().from(applicationsTable).where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, user.id)));
  if (!a) throw new HttpError(404, "Application not found.");
  if (!WITHDRAWABLE.includes(a.status)) throw new HttpError(409, `An application that is "${a.status}" cannot be withdrawn.`);
  await db.update(applicationsTable).set({ status: "Withdrawn", updatedAt: new Date() }).where(eq(applicationsTable.id, id));
  await db.insert(applicationEventsTable).values({ applicationId: id, status: "Withdrawn", note: "Withdrawn by applicant", actorId: user.id });
  res.json((await myApplications(user.id, id))[0]);
});

export default router;
