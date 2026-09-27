import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";

export const skillsTable = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Practical"),
    description: text("description").notNull().default(""),
  },
  (t) => [uniqueIndex("skills_name_uq").on(t.name)],
);

export type VerificationStatus = "Not Verified" | "Pending Review" | "Verified" | "Rejected";

export const userSkillsTable = pgTable(
  "user_skills",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    skillId: integer("skill_id").notNull().references(() => skillsTable.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("Comfortable"),
    yearsExperience: integer("years_experience").notNull().default(0),
    verificationStatus: text("verification_status").$type<VerificationStatus>().notNull().default("Not Verified"),
    verifiedVia: text("verified_via").$type<"assessment" | "admin_review">(),
    evidenceType: text("evidence_type"),
    evidenceUrl: text("evidence_url"),
    evidenceNote: text("evidence_note"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_skills_uq").on(t.userId, t.skillId), index("user_skills_status_idx").on(t.verificationStatus)],
);

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull().default("Beginner"),
  duration: text("duration").notNull().default(""),
  description: text("description").notNull().default(""),
  skillsGained: text("skills_gained").array().notNull().default([]),
  /** Catalog skill names that a passed assessment verifies for the learner. */
  verifiesSkills: text("verifies_skills").array().notNull().default([]),
  passingScore: integer("passing_score").notNull().default(70),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseLessonsTable = pgTable(
  "course_lessons",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    videoUrl: text("video_url"),
    durationMinutes: integer("duration_minutes").notNull().default(10),
    content: text("content").notNull().default(""),
    objectives: text("objectives").array().notNull().default([]),
    resources: jsonb("resources").$type<Array<{ title: string; url: string }>>().notNull().default([]),
  },
  (t) => [index("course_lessons_course_idx").on(t.courseId, t.position)],
);

export const assessmentQuestionsTable = pgTable(
  "assessment_questions",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").$type<"multiple_choice" | "true_false" | "short_answer">().notNull(),
    prompt: text("prompt").notNull(),
    options: text("options").array().notNull().default([]),
    /** multiple_choice: option index as string; true_false: "true"/"false"; short_answer: unused. */
    correctAnswer: text("correct_answer").notNull().default(""),
    /** short_answer only: a response is accepted when it mentions at least `minKeywords` of these. */
    keywords: text("keywords").array().notNull().default([]),
    minKeywords: integer("min_keywords").notNull().default(1),
    explanation: text("explanation").notNull().default(""),
    skillName: text("skill_name"),
  },
  (t) => [index("assessment_questions_course_idx").on(t.courseId, t.position)],
);

export const courseEnrollmentsTable = pgTable(
  "course_enrollments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    status: text("status").$type<"in_progress" | "completed">().notNull().default("in_progress"),
    progress: integer("progress").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("course_enrollments_uq").on(t.userId, t.courseId)],
);

export const courseProgressTable = pgTable(
  "course_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull().references(() => courseLessonsTable.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_progress_uq").on(t.userId, t.lessonId), index("course_progress_course_idx").on(t.userId, t.courseId)],
);

export const skillAssessmentsTable = pgTable(
  "skill_assessments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"course" | "skill_check">().notNull().default("course"),
    attempt: integer("attempt").notNull(),
    score: real("score").notNull(),
    passed: boolean("passed").notNull(),
    answers: jsonb("answers").$type<Array<{ questionId: number; answer: string }>>().notNull(),
    results: jsonb("results").$type<Array<{ questionId: number; correct: boolean; feedback: string }>>().notNull(),
    aiFeedback: jsonb("ai_feedback").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skill_assessments_user_course_idx").on(t.userId, t.courseId)],
);

export const certificatesTable = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    score: real("score").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("certificates_user_course_uq").on(t.userId, t.courseId), uniqueIndex("certificates_code_uq").on(t.code)],
);
