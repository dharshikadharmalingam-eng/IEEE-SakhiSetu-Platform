import { date, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { employersTable, usersTable } from "./accounts";
import { skillsTable } from "./learning";

export const opportunitiesTable = pgTable(
  "opportunities",
  {
    id: serial("id").primaryKey(),
    employerId: integer("employer_id").notNull().references(() => employersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    responsibilities: text("responsibilities").notNull().default(""),
    category: text("category").notNull(),
    location: text("location").notNull(),
    workType: text("work_type").notNull(),
    availability: text("availability").notNull().default(""),
    experience: text("experience").notNull().default(""),
    experienceYears: integer("experience_years").notNull().default(0),
    compensation: text("compensation").notNull().default(""),
    deadline: date("deadline", { mode: "string" }),
    status: text("status").$type<"open" | "closed" | "removed">().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("opportunities_employer_idx").on(t.employerId, t.status), index("opportunities_status_idx").on(t.status)],
);

export const opportunitySkillsTable = pgTable(
  "opportunity_skills",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    skillId: integer("skill_id").notNull().references(() => skillsTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"required" | "preferred">().notNull().default("required"),
  },
  (t) => [uniqueIndex("opportunity_skills_uq").on(t.opportunityId, t.skillId)],
);

export const savedOpportunitiesTable = pgTable(
  "saved_opportunities",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("saved_opportunities_uq").on(t.userId, t.opportunityId)],
);

export type ApplicationStatus = "Applied" | "Under Review" | "Shortlisted" | "Interview" | "Selected" | "Rejected" | "Withdrawn";

export const applicationsTable = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").$type<ApplicationStatus>().notNull().default("Applied"),
    matchPercent: integer("match_percent").notNull().default(0),
    coverNote: text("cover_note").notNull().default(""),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("applications_opp_user_uq").on(t.opportunityId, t.userId),
    index("applications_user_idx").on(t.userId),
    index("applications_status_idx").on(t.status),
  ],
);

export const applicationEventsTable = pgTable(
  "application_events",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note").notNull().default(""),
    actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_app_idx").on(t.applicationId)],
);

export const employerProfileViewsTable = pgTable(
  "employer_profile_views",
  {
    id: serial("id").primaryKey(),
    employerId: integer("employer_id").notNull().references(() => employersTable.id, { onDelete: "cascade" }),
    viewerId: integer("viewer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    viewedOn: date("viewed_on", { mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("employer_profile_views_uq").on(t.employerId, t.viewerId, t.viewedOn)],
);

export const feedbackTable = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    employerId: integer("employer_id").notNull().references(() => employersTable.id, { onDelete: "cascade" }),
    fromUserId: integer("from_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    toUserId: integer("to_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"employer_to_woman" | "woman_to_employer">().notNull(),
    ratings: jsonb("ratings").$type<Record<string, number>>().notNull(),
    rating: real("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_app_direction_uq").on(t.applicationId, t.direction), index("feedback_to_idx").on(t.toUserId)],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const reportsTable = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"employer" | "opportunity" | "feedback" | "content">().notNull(),
    targetId: integer("target_id").notNull(),
    reason: text("reason").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<"Open" | "Under Review" | "Resolved" | "Rejected">().notNull().default("Open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status), index("reports_reporter_idx").on(t.reporterId)],
);
