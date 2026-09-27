import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  applicationsTable, certificatesTable, coursesTable, courseEnrollmentsTable, db, employersTable, feedbackTable,
  notificationsTable, opportunitiesTable, opportunitySkillsTable, savedOpportunitiesTable, skillAssessmentsTable,
  skillsTable, userSkillsTable, usersTable, womenProfilesTable, type VerificationStatus, type WomanProfile,
} from "@workspace/db";
import type { Opportunity } from "@workspace/api-zod";
import { computeMatch, type CourseBySkill, type MatchResult } from "./matching";
import { calculateSakhiScore, ensureScoreSnapshot, recordScoreSnapshot, type SakhiScoreInput } from "./sakhi-score";
import { notify } from "./notify";

export type LearnerSkill = {
  id: number;
  skillId: number;
  name: string;
  category: string;
  level: string;
  years: number;
  status: VerificationStatus;
  verified: boolean;
  evidenceType: string | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  reviewNotes: string | null;
};

export type Learner = {
  userId: number;
  name: string;
  profile: WomanProfile;
  skills: LearnerSkill[];
  courses: Array<{ id: number; title: string; progress: number; status: string }>;
  assessmentsPassed: number;
  feedbackCount: number;
  feedbackAverage: number | null;
  completedWork: number;
};

const EMPTY_PROFILE = (userId: number): WomanProfile => ({
  userId, city: "", area: "", education: "", employmentStatus: "", interests: [], workPreferences: [], availability: "", goal: "", experienceNotes: "", updatedAt: new Date(),
});

export async function loadLearner(userId: number): Promise<Learner> {
  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  const [profile] = await db.select().from(womenProfilesTable).where(eq(womenProfilesTable.userId, userId));
  const skillRows = await db
    .select({ us: userSkillsTable, skill: skillsTable })
    .from(userSkillsTable)
    .innerJoin(skillsTable, eq(skillsTable.id, userSkillsTable.skillId))
    .where(eq(userSkillsTable.userId, userId))
    .orderBy(asc(userSkillsTable.id));
  const skills: LearnerSkill[] = skillRows.map(({ us, skill }) => ({
    id: us.id, skillId: skill.id, name: skill.name, category: skill.category, level: us.level, years: us.yearsExperience,
    status: us.verificationStatus, verified: us.verificationStatus === "Verified", evidenceType: us.evidenceType,
    evidenceUrl: us.evidenceUrl, evidenceNote: us.evidenceNote, reviewNotes: us.reviewNotes,
  }));
  const courseRows = await db.select().from(coursesTable).where(eq(coursesTable.published, true)).orderBy(asc(coursesTable.id));
  const enrollments = await db.select().from(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.userId, userId));
  const byCourse = new Map(enrollments.map((e) => [e.courseId, e]));
  const courses = courseRows.map((c) => {
    const e = byCourse.get(c.id);
    return { id: c.id, title: c.title, progress: e?.progress ?? 0, status: e ? (e.status === "completed" ? "completed" : e.progress > 0 ? "in_progress" : "not_started") : "not_started" };
  });
  const [{ passed }] = await db
    .select({ passed: sql<number>`count(distinct ${skillAssessmentsTable.courseId})::int` })
    .from(skillAssessmentsTable)
    .where(and(eq(skillAssessmentsTable.userId, userId), eq(skillAssessmentsTable.passed, true)));
  const [fb] = await db
    .select({ n: sql<number>`count(*)::int`, avg: sql<number | null>`avg(${feedbackTable.rating})` })
    .from(feedbackTable)
    .where(and(eq(feedbackTable.toUserId, userId), eq(feedbackTable.direction, "employer_to_woman")));
  const [{ done }] = await db
    .select({ done: sql<number>`count(*)::int` })
    .from(applicationsTable)
    .where(and(eq(applicationsTable.userId, userId), eq(applicationsTable.status, "Selected"), sql`${applicationsTable.completedAt} is not null`));
  return {
    userId, name: user?.name ?? "", profile: profile ?? EMPTY_PROFILE(userId), skills, courses, assessmentsPassed: passed,
    feedbackCount: fb?.n ?? 0, feedbackAverage: fb?.avg !== null && fb?.avg !== undefined ? Number(fb.avg) : null, completedWork: done,
  };
}

export async function loadCourseBySkill(): Promise<CourseBySkill> {
  const rows = await db.select({ id: coursesTable.id, title: coursesTable.title, verifies: coursesTable.verifiesSkills }).from(coursesTable).where(eq(coursesTable.published, true)).orderBy(asc(coursesTable.id));
  const map: CourseBySkill = new Map();
  for (const r of rows) for (const s of r.verifies) if (!map.has(s.toLowerCase())) map.set(s.toLowerCase(), { id: r.id, title: r.title });
  return map;
}

export type OppRow = {
  id: number; employerId: number; title: string; description: string; responsibilities: string; category: string;
  location: string; workType: string; availability: string; experience: string; experienceYears: number; compensation: string;
  deadline: string | null; status: "open" | "closed" | "removed"; createdAt: Date; businessName: string;
  employerStatus: "Pending" | "Verified" | "Rejected"; requiredSkills: string[]; preferredSkills: string[];
};

export async function loadOpportunities(where?: ReturnType<typeof and>): Promise<OppRow[]> {
  const rows = await db
    .select({ o: opportunitiesTable, e: employersTable })
    .from(opportunitiesTable)
    .innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId))
    .where(where)
    .orderBy(desc(opportunitiesTable.createdAt), desc(opportunitiesTable.id));
  if (!rows.length) return [];
  const skillRows = await db
    .select({ oppId: opportunitySkillsTable.opportunityId, name: skillsTable.name, kind: opportunitySkillsTable.kind })
    .from(opportunitySkillsTable)
    .innerJoin(skillsTable, eq(skillsTable.id, opportunitySkillsTable.skillId))
    .where(inArray(opportunitySkillsTable.opportunityId, rows.map((r) => r.o.id)));
  return rows.map(({ o, e }) => ({
    ...o,
    businessName: e.businessName,
    employerStatus: e.verificationStatus,
    requiredSkills: skillRows.filter((s) => s.oppId === o.id && s.kind === "required").map((s) => s.name),
    preferredSkills: skillRows.filter((s) => s.oppId === o.id && s.kind === "preferred").map((s) => s.name),
  }));
}

/** Opportunities women can see: open, from a currently verified employer, and not past deadline. */
export function visibleToWomen(): ReturnType<typeof and> {
  return and(
    eq(opportunitiesTable.status, "open"),
    eq(employersTable.verificationStatus, "Verified"),
    sql`exists (select 1 from users u where u.id = ${employersTable.userId} and u.status = 'active')`,
    sql`(${opportunitiesTable.deadline} is null or ${opportunitiesTable.deadline} >= current_date)`,
  );
}

export function matchFor(learner: Learner, opp: OppRow, courseBySkill: CourseBySkill): MatchResult {
  return computeMatch(
    {
      city: learner.profile.city, workPreferences: learner.profile.workPreferences, availability: learner.profile.availability,
      skills: learner.skills.map((s) => ({ name: s.name, verified: s.verified, years: s.years })),
      feedbackAverage: learner.feedbackAverage, feedbackCount: learner.feedbackCount,
    },
    { location: opp.location, workType: opp.workType, availability: opp.availability, experienceYears: opp.experienceYears, requiredSkills: opp.requiredSkills, preferredSkills: opp.preferredSkills },
    courseBySkill,
  );
}

export type Extras = { saved?: Set<number>; applications?: Map<number, { id: number; status: string }> };

export function toOpportunityDto(opp: OppRow, m: MatchResult, extras: Extras = {}): Opportunity {
  return {
    id: opp.id, employerId: opp.employerId, title: opp.title, employer: opp.businessName, location: opp.location, workType: opp.workType,
    category: opp.category, requiredSkills: opp.requiredSkills, preferredSkills: opp.preferredSkills, match: m.match, skillGap: m.skillGap,
    matchedSkills: m.matchingSkills, gapCourses: m.gapCourses, verifiedEmployer: opp.employerStatus === "Verified", employerVerificationStatus: opp.employerStatus,
    description: opp.description, responsibilities: opp.responsibilities, availability: opp.availability, experience: opp.experience,
    compensation: opp.compensation, deadline: opp.deadline, status: opp.status, saved: extras.saved?.has(opp.id) ?? false,
    application: extras.applications?.get(opp.id) ?? null,
    verifiedSkillCount: m.matchingSkills.length - m.unverifiedSkills.length,
  };
}

export async function learnerExtras(userId: number): Promise<Extras> {
  const saved = await db.select({ id: savedOpportunitiesTable.opportunityId }).from(savedOpportunitiesTable).where(eq(savedOpportunitiesTable.userId, userId));
  const apps = await db.select({ id: applicationsTable.id, oppId: applicationsTable.opportunityId, status: applicationsTable.status }).from(applicationsTable).where(eq(applicationsTable.userId, userId));
  return { saved: new Set(saved.map((s) => s.id)), applications: new Map(apps.map((a) => [a.oppId, { id: a.id, status: a.status }])) };
}

/** All visible opportunities with this learner's match, best first. */
export async function rankedMatches(learner: Learner) {
  const [opps, courseBySkill] = await Promise.all([loadOpportunities(visibleToWomen()), loadCourseBySkill()]);
  return opps.map((opp) => ({ opp, m: matchFor(learner, opp, courseBySkill) })).sort((a, b) => b.m.match - a.m.match || a.opp.id - b.opp.id);
}

export const GOOD_MATCH = 70;

export async function scoreInputFor(learner: Learner, ranked?: Awaited<ReturnType<typeof rankedMatches>>): Promise<SakhiScoreInput> {
  const matches = ranked ?? (await rankedMatches(learner));
  const experienceYears = learner.skills.reduce((t, s) => t + s.years, 0);
  const gaps: NonNullable<SakhiScoreInput["skillGaps"]> = [];
  for (const { opp, m } of matches.slice(0, 4)) {
    for (const g of m.gapCourses) {
      if (g.courseId && !gaps.some((x) => x.skill === g.skill)) gaps.push({ skill: g.skill, courseId: g.courseId, courseTitle: g.courseTitle!, forOpportunity: opp.title });
    }
  }
  return {
    skills: learner.skills.map((s) => ({ name: s.name, verified: s.verified })),
    courses: learner.courses,
    assessmentsPassed: learner.assessmentsPassed,
    profile: { availability: learner.profile.availability, workPreferences: learner.profile.workPreferences },
    experienceEvidence: learner.profile.experienceNotes.trim() ? [learner.profile.experienceNotes] : [],
    experienceYears,
    completedWork: learner.completedWork,
    feedbackCount: learner.feedbackCount,
    feedbackAverage: learner.feedbackAverage,
    availabilityMatchesOpportunities: matches.some(({ m }) => m.components.find((c) => c.key === "availability")?.status === "full" && m.match >= 60),
    skillGaps: gaps,
  };
}

export async function currentScore(userId: number) {
  const learner = await loadLearner(userId);
  const result = calculateSakhiScore(await scoreInputFor(learner));
  await ensureScoreSnapshot(userId, result.score);
  return { learner, result };
}

/**
 * Recalculate the Sakhi Score after a real event, record history (only when it changes),
 * notify the woman, and surface any newly matching opportunities.
 */
export async function refreshScore(userId: number, reason: string): Promise<{ before: number; after: number }> {
  const learner = await loadLearner(userId);
  const ranked = await rankedMatches(learner);
  const result = calculateSakhiScore(await scoreInputFor(learner, ranked));
  const previous = await recordScoreSnapshot(userId, result.score, reason);
  const before = previous ?? result.score;
  if (previous !== null && previous !== result.score) {
    await notify(userId, "score_updated", `SAKHI SCORE updated: ${previous} → ${result.score}`, reason, "/sakhi-score");
  }
  await notifyNewMatches(userId, ranked);
  return { before, after: result.score };
}

export async function notifyNewMatches(userId: number, ranked?: Awaited<ReturnType<typeof rankedMatches>>): Promise<void> {
  const list = ranked ?? (await rankedMatches(await loadLearner(userId)));
  const good = list.filter(({ m }) => m.match >= GOOD_MATCH).slice(0, 5);
  if (!good.length) return;
  const links = good.map(({ opp }) => `/opportunities/${opp.id}`);
  const existing = await db
    .select({ link: notificationsTable.link })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.type, "new_match"), inArray(notificationsTable.link, links)));
  const seen = new Set(existing.map((e) => e.link));
  for (const { opp, m } of good) {
    const link = `/opportunities/${opp.id}`;
    if (!seen.has(link)) await notify(userId, "new_match", `New matching opportunity: ${opp.title}`, `${m.match}% match with ${opp.businessName}. See exactly why it matches.`, link);
  }
}

export async function learnerCertificates(userId: number) {
  return db
    .select({ c: certificatesTable, course: coursesTable })
    .from(certificatesTable)
    .innerJoin(coursesTable, eq(coursesTable.id, certificatesTable.courseId))
    .where(eq(certificatesTable.userId, userId))
    .orderBy(desc(certificatesTable.issuedAt));
}
