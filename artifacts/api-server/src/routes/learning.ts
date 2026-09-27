import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { GetCourseParams, SubmitCourseAssessmentBody, SubmitSkillCheckBody, UpdateCourseProgressBody } from "@workspace/api-zod";
import {
  assessmentQuestionsTable, certificatesTable, courseEnrollmentsTable, courseLessonsTable, courseProgressTable, coursesTable, db,
  skillAssessmentsTable, skillsTable, userSkillsTable, usersTable,
} from "@workspace/db";
import { me, requireRole } from "../lib/auth";
import { HttpError, parse } from "../lib/http";
import { ensureSkill } from "../lib/catalog";
import { aiEnabled, learningFeedback } from "../lib/ai";
import { learnerCertificates, refreshScore } from "../lib/learner";
import { notify, notifyOnce } from "../lib/notify";

const router: IRouter = Router();

export const CERT_WORDING = "Completion of SakhiSetu learning and assessment.";
export const CERT_DISCLAIMER = "This is a SakhiSetu learning record. It does not replace a professional licence, a government qualification, or an accredited certification.";

// Any signed-in user may read the shared skill catalog (employers use it when writing opportunities).
router.get("/skills/catalog", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Please sign in to continue.");
  res.json(await db.select({ id: skillsTable.id, name: skillsTable.name, category: skillsTable.category }).from(skillsTable).orderBy(skillsTable.name));
});

router.use(["/courses", "/certificates"], requireRole("woman"));
router.post("/assessments", requireRole("woman"));

type CourseRow = typeof coursesTable.$inferSelect;

async function learnerCourseState(userId: number, courses: CourseRow[]) {
  const ids = courses.map((c) => c.id);
  if (!ids.length) return new Map<number, { progress: number; status: "not_started" | "in_progress" | "completed"; passed: boolean }>();
  const enrollments = await db.select().from(courseEnrollmentsTable).where(and(eq(courseEnrollmentsTable.userId, userId), inArray(courseEnrollmentsTable.courseId, ids)));
  const passes = await db.select({ courseId: skillAssessmentsTable.courseId }).from(skillAssessmentsTable).where(and(eq(skillAssessmentsTable.userId, userId), eq(skillAssessmentsTable.passed, true), inArray(skillAssessmentsTable.courseId, ids)));
  const passedSet = new Set(passes.map((p) => p.courseId));
  const byCourse = new Map(enrollments.map((e) => [e.courseId, e]));
  return new Map(ids.map((id) => {
    const e = byCourse.get(id);
    const status = e?.status === "completed" ? "completed" : e && e.progress > 0 ? "in_progress" : "not_started";
    return [id, { progress: e?.progress ?? 0, status: status as "not_started" | "in_progress" | "completed", passed: passedSet.has(id) }];
  }));
}

const courseBase = (c: CourseRow, lessonCount: number, st: { progress: number; status: "not_started" | "in_progress" | "completed"; passed: boolean }) => ({
  id: c.id, title: c.title, category: c.category, difficulty: c.difficulty, duration: c.duration, description: c.description,
  skillsGained: c.skillsGained, verifiesSkills: c.verifiesSkills, lessonCount, passingScore: c.passingScore, progress: st.progress, status: st.status, passed: st.passed,
});

router.get("/courses", async (req, res) => {
  const user = me(req);
  const courses = await db.select().from(coursesTable).where(eq(coursesTable.published, true)).orderBy(asc(coursesTable.id));
  const counts = await db.select({ courseId: courseLessonsTable.courseId, n: sql<number>`count(*)::int` }).from(courseLessonsTable).groupBy(courseLessonsTable.courseId);
  const state = await learnerCourseState(user.id, courses);
  res.json(courses.map((c) => courseBase(c, counts.find((n) => n.courseId === c.id)?.n ?? 0, state.get(c.id)!)));
});

async function publishedCourse(id: number): Promise<CourseRow> {
  const [c] = await db.select().from(coursesTable).where(and(eq(coursesTable.id, id), eq(coursesTable.published, true)));
  if (!c) throw new HttpError(404, "Course not found.");
  return c;
}

async function completedLessonIds(userId: number, courseId: number): Promise<number[]> {
  const rows = await db.select({ lessonId: courseProgressTable.lessonId }).from(courseProgressTable).where(and(eq(courseProgressTable.userId, userId), eq(courseProgressTable.courseId, courseId)));
  return rows.map((r) => r.lessonId);
}

router.get("/courses/:id", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  const course = await publishedCourse(id);
  const lessons = await db.select().from(courseLessonsTable).where(eq(courseLessonsTable.courseId, id)).orderBy(asc(courseLessonsTable.position), asc(courseLessonsTable.id));
  const questions = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.courseId, id)).orderBy(asc(assessmentQuestionsTable.position), asc(assessmentQuestionsTable.id));
  const done = new Set(await completedLessonIds(user.id, id));
  const state = (await learnerCourseState(user.id, [course])).get(id)!;
  const attempts = await db.select().from(skillAssessmentsTable).where(and(eq(skillAssessmentsTable.userId, user.id), eq(skillAssessmentsTable.courseId, id))).orderBy(desc(skillAssessmentsTable.createdAt));
  const cert = (await learnerCertificates(user.id)).find((c) => c.c.courseId === id);
  res.json({
    ...courseBase(course, lessons.length, state),
    lessons: lessons.map((l) => ({ id: l.id, position: l.position, title: l.title, description: l.description, videoUrl: l.videoUrl, durationMinutes: l.durationMinutes, content: l.content, objectives: l.objectives, resources: l.resources, completed: done.has(l.id) })),
    // Correct answers and keywords never leave the server.
    questions: questions.map((q) => ({ id: q.id, position: q.position, type: q.type, prompt: q.prompt, options: q.options, skillName: q.skillName })),
    attempts: attempts.map((a) => ({ id: a.id, kind: a.kind, attempt: a.attempt, score: Math.round(a.score), passed: a.passed, createdAt: a.createdAt.toISOString() })),
    certificate: cert ? certDto(cert.c, cert.course, user.name) : null,
    assessmentReady: lessons.length > 0 && lessons.every((l) => done.has(l.id)),
    aiFeedbackAvailable: aiEnabled(),
  });
});

router.post("/courses/:id/enroll", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  await publishedCourse(id);
  await db.insert(courseEnrollmentsTable).values({ userId: user.id, courseId: id }).onConflictDoNothing();
  const [e] = await db.select().from(courseEnrollmentsTable).where(and(eq(courseEnrollmentsTable.userId, user.id), eq(courseEnrollmentsTable.courseId, id)));
  res.json({ courseId: id, progress: e!.progress, status: e!.status });
});

router.put("/courses/:id/progress", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  const b = parse(UpdateCourseProgressBody, req.body);
  const course = await publishedCourse(id);
  const [lesson] = await db.select().from(courseLessonsTable).where(and(eq(courseLessonsTable.id, b.lessonId), eq(courseLessonsTable.courseId, id)));
  if (!lesson) throw new HttpError(404, "Lesson not found in this course.");
  await db.insert(courseEnrollmentsTable).values({ userId: user.id, courseId: id }).onConflictDoNothing();
  if (b.completed === false) await db.delete(courseProgressTable).where(and(eq(courseProgressTable.userId, user.id), eq(courseProgressTable.lessonId, lesson.id)));
  else await db.insert(courseProgressTable).values({ userId: user.id, courseId: id, lessonId: lesson.id }).onConflictDoNothing();
  const total = (await db.select({ id: courseLessonsTable.id }).from(courseLessonsTable).where(eq(courseLessonsTable.courseId, id))).length;
  const done = await completedLessonIds(user.id, id);
  const progress = total ? Math.round((done.length / total) * 100) : 0;
  const [existing] = await db.select().from(courseEnrollmentsTable).where(and(eq(courseEnrollmentsTable.userId, user.id), eq(courseEnrollmentsTable.courseId, id)));
  const keepCompleted = existing?.status === "completed"; // a passed course stays completed
  if (!keepCompleted) await db.update(courseEnrollmentsTable).set({ progress }).where(and(eq(courseEnrollmentsTable.userId, user.id), eq(courseEnrollmentsTable.courseId, id)));
  const link = `/learning/${id}`;
  if (!keepCompleted && progress >= 80 && progress < 100) await notifyOnce(user.id, "course_progress", `${course.title} is 80% complete`, "You are close — a few lessons left before the assessment.", link);
  if (!keepCompleted && progress >= 100) await notifyOnce(user.id, "assessment_ready", `Assessment ready: ${course.title}`, "You finished every lesson. Take the assessment to verify what you learned.", link);
  res.json({ courseId: id, progress: keepCompleted ? 100 : progress, status: keepCompleted ? "completed" : "in_progress", completedLessonIds: done, assessmentReady: total > 0 && done.length === total });
});

// ---- assessment ------------------------------------------------------------
type Question = typeof assessmentQuestionsTable.$inferSelect;

export function grade(questions: Question[], answers: Array<{ questionId: number; answer: string }>) {
  const byId = new Map(answers.map((a) => [a.questionId, a.answer ?? ""]));
  const results = questions.map((q) => {
    const given = (byId.get(q.id) ?? "").trim();
    let correct = false;
    if (given) {
      if (q.type === "short_answer") {
        const text = given.toLowerCase();
        correct = q.keywords.filter((k) => text.includes(k.toLowerCase())).length >= Math.max(1, q.minKeywords);
      } else correct = given.toLowerCase() === q.correctAnswer.toLowerCase();
    }
    const feedback = !given ? "No answer given." : correct ? `Correct. ${q.explanation}`.trim() : `Not quite. ${q.explanation}`.trim();
    return { questionId: q.id, correct, feedback };
  });
  const score = questions.length ? (results.filter((r) => r.correct).length / questions.length) * 100 : 0;
  return { results, score };
}

async function certificateRows(userId: number, courseId: number) {
  return (await learnerCertificates(userId)).find((c) => c.c.courseId === courseId);
}

export function certDto(c: typeof certificatesTable.$inferSelect, course: CourseRow, holderName: string) {
  return { id: c.id, code: c.code, courseId: c.courseId, courseTitle: course.title, skills: course.verifiesSkills, score: Math.round(c.score), issuedAt: c.issuedAt.toISOString(), holderName, wording: CERT_WORDING, disclaimer: CERT_DISCLAIMER };
}

export async function takeAssessment(userId: number, userName: string, courseId: number, answers: Array<{ questionId: number; answer: string }>, kind: "course" | "skill_check") {
  const course = await publishedCourse(courseId);
  const questions = await db.select().from(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.courseId, courseId)).orderBy(asc(assessmentQuestionsTable.position), asc(assessmentQuestionsTable.id));
  if (!questions.length) throw new HttpError(409, "This course does not have an assessment yet.");
  if (kind === "course") {
    const lessons = await db.select({ id: courseLessonsTable.id }).from(courseLessonsTable).where(eq(courseLessonsTable.courseId, courseId));
    const done = new Set(await completedLessonIds(userId, courseId));
    if (lessons.some((l) => !done.has(l.id))) throw new HttpError(409, "Complete every lesson first, or take the skill check instead if you already know this topic.");
  }
  const { results, score } = grade(questions, answers);
  const passed = score >= course.passingScore;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(skillAssessmentsTable).where(and(eq(skillAssessmentsTable.userId, userId), eq(skillAssessmentsTable.courseId, courseId)));
  const attempt = n + 1;
  const ai = aiEnabled()
    ? await learningFeedback({ course: course.title, items: questions.map((q) => ({ question: q.prompt, answer: answers.find((a) => a.questionId === q.id)?.answer ?? "", correct: results.find((r) => r.questionId === q.id)?.correct ?? false })).filter((_, i) => questions[i]!.type === "short_answer") })
    : null;
  await db.insert(skillAssessmentsTable).values({ userId, courseId, kind, attempt, score, passed, answers, results, aiFeedback: ai });

  const empty = { verifiedSkills: [] as string[], certificate: null as ReturnType<typeof certDto> | null, before: 0, after: 0 };
  let outcome = empty;
  if (passed) {
    let before: number | null = null;
    let after = 0;
    let certificate: ReturnType<typeof certDto> | null = null;
    if (kind === "course") {
      await db.insert(courseEnrollmentsTable).values({ userId, courseId, status: "completed", progress: 100, completedAt: new Date() })
        .onConflictDoUpdate({ target: [courseEnrollmentsTable.userId, courseEnrollmentsTable.courseId], set: { status: "completed", progress: 100, completedAt: new Date() } });
      const existing = await certificateRows(userId, courseId);
      if (!existing) {
        await db.insert(certificatesTable).values({ userId, courseId, code: `SS-${courseId}${userId}-${randomBytes(4).toString("hex").toUpperCase()}`, score });
        await notify(userId, "course_completed", `Course completed: ${course.title}`, "Your SakhiSetu completion certificate is ready.", "/certificates");
      }
      const cert = await certificateRows(userId, courseId);
      certificate = cert ? certDto(cert.c, cert.course, userName) : null;
      const r = await refreshScore(userId, `Course completed and assessment passed: ${course.title}`);
      before = r.before;
      after = r.after;
    }
    const verified: string[] = [];
    for (const skillName of course.verifiesSkills) {
      const skill = await ensureSkill(skillName, course.category);
      const [row] = await db.select().from(userSkillsTable).where(and(eq(userSkillsTable.userId, userId), eq(userSkillsTable.skillId, skill.id)));
      if (!row) await db.insert(userSkillsTable).values({ userId, skillId: skill.id, level: "Comfortable", verificationStatus: "Verified", verifiedVia: "assessment" });
      else if (row.verificationStatus !== "Verified") await db.update(userSkillsTable).set({ verificationStatus: "Verified", verifiedVia: "assessment", reviewNotes: null, updatedAt: new Date() }).where(eq(userSkillsTable.id, row.id));
      else continue;
      verified.push(skill.name);
      await notify(userId, "skill_verification", `Skill verified: ${skill.name}`, `You passed the ${course.title} assessment.`, "/skills");
    }
    const r2 = await refreshScore(userId, verified.length ? `Skill verified: ${verified.join(", ")}` : `Passed assessment: ${course.title}`);
    before ??= r2.before;
    after = r2.after;
    outcome = { verifiedSkills: verified, certificate, before, after };
  }
  const message = passed
    ? kind === "course" ? "Well done — you passed. Your learning is verified and your certificate is ready." : "You passed the skill check. Finish the lessons to earn a completion certificate."
    : `You scored ${Math.round(score)}%. You need ${course.passingScore}% to pass. Review the lessons and try again whenever you are ready.`;
  return {
    passed, score: Math.round(score), passingScore: course.passingScore, attempt, verifiedSkill: outcome.verifiedSkills[0] ?? course.verifiesSkills[0] ?? course.title,
    verifiedSkills: outcome.verifiedSkills, certificateGenerated: Boolean(outcome.certificate), certificate: outcome.certificate, results, sakhiScore: { before: outcome.before, after: outcome.after }, aiFeedback: ai, message,
  };
}

router.post("/courses/:id/assessment", async (req, res) => {
  const user = me(req);
  const { id } = parse(GetCourseParams, req.params);
  const b = parse(SubmitCourseAssessmentBody, req.body);
  res.json(await takeAssessment(user.id, user.name, id, b.answers, "course"));
});

router.post("/assessments", async (req, res) => {
  const user = me(req);
  const b = parse(SubmitSkillCheckBody, req.body);
  res.json(await takeAssessment(user.id, user.name, b.courseId, b.answers, "skill_check"));
});

router.get("/certificates", async (req, res) => {
  const user = me(req);
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.id));
  res.json((await learnerCertificates(user.id)).map(({ c, course }) => certDto(c, course, u?.name ?? user.name)));
});

export default router;
