import { asc, eq, sql } from "drizzle-orm";
import {
  applicationEventsTable, applicationsTable, assessmentQuestionsTable, courseLessonsTable, courseProgressTable, coursesTable, courseEnrollmentsTable, db,
  employerVerificationsTable, employersTable, opportunitiesTable, opportunitySkillsTable, pool, sakhiScoreHistoryTable, skillsTable, userSkillsTable, usersTable, womenProfilesTable,
} from "@workspace/db";
import { hashPassword } from "./lib/auth";
import { logger } from "./lib/logger";
import { ensureSkill } from "./lib/catalog";
import { currentScore, refreshScore } from "./lib/learner";
import { notify } from "./lib/notify";
import { takeAssessment } from "./routes/learning";
import { COURSES, EMPLOYERS, OPPORTUNITIES, SKILLS } from "./seed-data";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const DEMO_DOMAIN = "demo.sakhisetu.example";

export async function seedIfEmpty(): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(usersTable);
  if (n > 0) return false;
  await seedDemo();
  return true;
}

async function backdateHistory(userId: number, spacingDays: number) {
  const rows = await db.select().from(sakhiScoreHistoryTable).where(eq(sakhiScoreHistoryTable.userId, userId)).orderBy(asc(sakhiScoreHistoryTable.id));
  for (const [i, r] of rows.entries()) await db.update(sakhiScoreHistoryTable).set({ createdAt: ago((rows.length - 1 - i) * spacingDays + 1) }).where(eq(sakhiScoreHistoryTable.id, r.id));
}

async function passCourse(userId: number, name: string, title: string) {
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.title, title));
  const lessons = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.courseId, course!.id));
  await db.insert(courseEnrollmentsTable).values({ userId, courseId: course!.id, progress: 100 }).onConflictDoNothing();
  for (const l of lessons) await db.insert(courseProgressTable).values({ userId, courseId: course!.id, lessonId: l.id }).onConflictDoNothing();
  const qs = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.courseId, course!.id));
  const answers = qs.map((q) => ({ questionId: q.id, answer: q.type === "short_answer" ? q.keywords.join(" ") : q.correctAnswer }));
  return takeAssessment(userId, name, course!.id, answers, "course");
}

export async function seedDemo(opts: { reset?: boolean } = {}): Promise<void> {
  if (opts.reset) {
    const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    if (rows.length) await pool.query(`truncate table ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  }
  const demoPassword = process.env["DEMO_PASSWORD"] || "SakhiDemo2026";
  const passwordHash = await hashPassword(demoPassword);
  logger.info("Seeding SakhiSetu demo data");

  for (const [name, category] of SKILLS) await db.insert(skillsTable).values({ name, category }).onConflictDoNothing();

  for (const c of COURSES) {
    const [course] = await db.insert(coursesTable).values({ title: c.title, category: c.category, difficulty: c.difficulty, duration: c.duration, description: c.description, skillsGained: c.skillsGained, verifiesSkills: c.verifiesSkills }).returning();
    for (const [i, l] of c.lessons.entries()) await db.insert(courseLessonsTable).values({ courseId: course!.id, position: i + 1, title: l.title, description: l.description, durationMinutes: l.minutes, objectives: l.objectives, content: l.content, videoUrl: null, resources: [] });
    for (const [i, q] of c.questions.entries()) {
      await db.insert(assessmentQuestionsTable).values({
        courseId: course!.id, position: i + 1, type: q.type, prompt: q.prompt, explanation: q.explanation, skillName: q.skill ?? null,
        options: q.type === "multiple_choice" ? q.options : [], correctAnswer: q.type === "multiple_choice" ? String(q.correct) : q.type === "true_false" ? String(q.correct) : "",
        keywords: q.type === "short_answer" ? q.keywords : [], minKeywords: q.type === "short_answer" ? q.min : 1,
      });
    }
  }

  // Admin: never public. Comes from env, or from a clearly-labelled demo account when DEMO_MODE=true.
  let adminId: number | null = null;
  const adminEmail = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (adminEmail && adminPassword) {
    [{ id: adminId }] = await db.insert(usersTable).values({ role: "admin", name: "SakhiSetu Admin", email: adminEmail, passwordHash: await hashPassword(adminPassword) }).returning({ id: usersTable.id });
  } else if (process.env["DEMO_MODE"] === "true") {
    [{ id: adminId }] = await db.insert(usersTable).values({ role: "admin", name: "Demo Admin", email: `admin@${DEMO_DOMAIN}`, passwordHash }).returning({ id: usersTable.id });
  } else {
    logger.warn("No admin account created. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one.");
  }

  const employerIds = new Map<string, number>();
  for (const e of EMPLOYERS) {
    const [u] = await db.insert(usersTable).values({ role: "employer", name: e.name, email: e.email, phone: e.phone, passwordHash }).returning({ id: usersTable.id });
    const [emp] = await db.insert(employersTable).values({ userId: u!.id, businessName: e.business, employerName: e.name, location: e.location, businessType: e.type, description: e.description, verificationStatus: e.status }).returning({ id: employersTable.id });
    employerIds.set(e.key, emp!.id);
    await db.insert(employerVerificationsTable).values({
      employerId: emp!.id, status: e.status, submittedInfo: e.info, submittedAt: ago(20),
      ...(e.status === "Verified" ? { reviewNotes: "Documents checked by SakhiSetu.", reviewedBy: adminId, reviewedAt: ago(18) } : {}),
    });
  }
  for (const o of OPPORTUNITIES) {
    const [row] = await db.insert(opportunitiesTable).values({
      employerId: employerIds.get(o.employer)!, title: o.title, description: o.description, responsibilities: o.responsibilities, category: o.category, location: o.location, workType: o.workType,
      availability: o.availability, experience: o.experience, experienceYears: o.experienceYears, compensation: o.compensation,
      deadline: o.deadlineDays ? new Date(Date.now() + o.deadlineDays * DAY).toISOString().slice(0, 10) : null, createdAt: ago(10),
    }).returning({ id: opportunitiesTable.id });
    for (const [names, kind] of [[o.required, "required"], [o.preferred, "preferred"]] as const) {
      for (const n of names) await db.insert(opportunitySkillsTable).values({ opportunityId: row!.id, skillId: (await ensureSkill(n)).id, kind }).onConflictDoNothing();
    }
  }

  // ---- Anitha: local part-time work; mid-journey ------------------------------------------------------------
  const [anitha] = await db.insert(usersTable).values({ role: "woman", name: "Anitha Kumar", email: `anitha@${DEMO_DOMAIN}`, phone: "+91 90000 20001", passwordHash }).returning({ id: usersTable.id });
  const aId = anitha!.id;
  await db.insert(womenProfilesTable).values({
    userId: aId, city: "Chennai", area: "Anna Nagar", education: "12th standard", employmentStatus: "Homemaker", interests: ["Childcare", "Cooking", "Working near home"],
    workPreferences: ["Local", "Part-time", "Flexible"], availability: "Evenings & weekends", goal: "Local part-time work",
    experienceNotes: "Looked after neighbours' children after school for three years; regularly cook for family gatherings.",
  });
  for (const [name, level, years] of [["Childcare", "Intermediate", 3], ["Cooking", "Intermediate", 5], ["Basic Digital Skills", "Basic", 1], ["Communication", "Comfortable", 3]] as const) {
    await db.insert(userSkillsTable).values({ userId: aId, skillId: (await ensureSkill(name)).id, level, yearsExperience: years });
  }
  await currentScore(aId); // records the "Initial profile" snapshot
  await db.update(userSkillsTable).set({ verificationStatus: "Verified", verifiedVia: "admin_review", evidenceType: "Experience document", evidenceNote: "Reference note from a neighbouring family.", reviewNotes: "Reference checked by SakhiSetu reviewer." })
    .where(sql`${userSkillsTable.userId} = ${aId} and ${userSkillsTable.skillId} = (select id from skills where name = 'Childcare')`);
  await refreshScore(aId, "Skill verified: Childcare");
  await passCourse(aId, "Anitha Kumar", "Canva Fundamentals");
  // Digital Literacy: two of four lessons done (in progress)
  const [dl] = await db.select().from(coursesTable).where(eq(coursesTable.title, "Digital Literacy"));
  const dlLessons = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.courseId, dl!.id)).orderBy(asc(courseLessonsTable.position));
  await db.insert(courseEnrollmentsTable).values({ userId: aId, courseId: dl!.id, progress: 50 });
  for (const l of dlLessons.slice(0, 2)) await db.insert(courseProgressTable).values({ userId: aId, courseId: dl!.id, lessonId: l.id });
  await backdateHistory(aId, 7);

  const opp = async (title: string) => (await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.title, title)))[0]!;
  const apply = async (title: string, statuses: string[], daysAgo: number, match: number) => {
    const o = await opp(title);
    const [a] = await db.insert(applicationsTable).values({ opportunityId: o.id, userId: aId, status: statuses.at(-1) as "Applied", matchPercent: match, appliedAt: ago(daysAgo), updatedAt: ago(daysAgo - 2), coverNote: "" }).returning();
    for (const [i, s] of statuses.entries()) await db.insert(applicationEventsTable).values({ applicationId: a!.id, status: s, note: s === "Applied" ? "Application submitted" : "", createdAt: ago(daysAgo - i) });
    const [emp] = await db.select({ userId: employersTable.userId }).from(employersTable).where(eq(employersTable.id, o.employerId));
    await notify(emp!.userId, "new_application", `New application for ${title}`, `A candidate with a ${match}% match applied.`, "/employer/applications");
    if (statuses.length > 1) await notify(aId, "application_status", `Application update: ${statuses.at(-1)}`, `${title}`, "/applications");
  };
  await apply("Home Cook", ["Applied", "Under Review"], 9, 90);
  await apply("Canva Designer", ["Applied", "Under Review", "Shortlisted"], 12, 79);

  // ---- Priya: technology pathway --------------------------------------------------------------------------------
  const [priya] = await db.insert(usersTable).values({ role: "woman", name: "Priya Sundaram", email: `priya@${DEMO_DOMAIN}`, phone: "+91 90000 20002", passwordHash }).returning({ id: usersTable.id });
  const pId = priya!.id;
  await db.insert(womenProfilesTable).values({
    userId: pId, city: "Chennai", area: "Velachery", education: "B.Sc", employmentStatus: "Seeking first job", interests: ["Technology", "Software testing"],
    workPreferences: ["Remote", "Part-time", "Flexible"], availability: "Weekdays, flexible hours", goal: "Technology work", experienceNotes: "Final-year project on a small inventory app; helped classmates with spreadsheets.",
  });
  for (const [name, level, years] of [["Computer Basics", "Comfortable", 1], ["Communication", "Comfortable", 1]] as const) {
    await db.insert(userSkillsTable).values({ userId: pId, skillId: (await ensureSkill(name)).id, level, yearsExperience: years });
  }
  await currentScore(pId);
  await passCourse(pId, "Priya Sundaram", "Digital Literacy");
  await backdateHistory(pId, 5);
  logger.info(`Seed complete. Demo accounts use *@${DEMO_DOMAIN}.`);
}
