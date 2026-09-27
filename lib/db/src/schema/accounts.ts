import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    role: text("role").$type<"woman" | "employer" | "admin">().notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").$type<"active" | "suspended">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_role_idx").on(t.role)],
);

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // HMAC of the session token; the raw token only lives in the cookie
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const womenProfilesTable = pgTable("women_profiles", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  city: text("city").notNull().default(""),
  area: text("area").notNull().default(""),
  education: text("education").notNull().default(""),
  employmentStatus: text("employment_status").notNull().default(""),
  interests: text("interests").array().notNull().default([]),
  workPreferences: text("work_preferences").array().notNull().default([]),
  availability: text("availability").notNull().default(""),
  goal: text("goal").notNull().default(""),
  experienceNotes: text("experience_notes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employersTable = pgTable(
  "employers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    employerName: text("employer_name").notNull(),
    location: text("location").notNull(),
    businessType: text("business_type").notNull(),
    description: text("description").notNull().default(""),
    verificationStatus: text("verification_status").$type<"Pending" | "Verified" | "Rejected">().notNull().default("Pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("employers_user_uq").on(t.userId), index("employers_status_idx").on(t.verificationStatus)],
);

export const employerVerificationsTable = pgTable(
  "employer_verifications",
  {
    id: serial("id").primaryKey(),
    employerId: integer("employer_id").notNull().references(() => employersTable.id, { onDelete: "cascade" }),
    status: text("status").$type<"Pending" | "Verified" | "Rejected">().notNull().default("Pending"),
    submittedInfo: text("submitted_info").notNull().default(""),
    evidenceUrl: text("evidence_url"),
    reviewNotes: text("review_notes"),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("employer_verifications_employer_idx").on(t.employerId)],
);

export type User = typeof usersTable.$inferSelect;
export type WomanProfile = typeof womenProfilesTable.$inferSelect;
export type Employer = typeof employersTable.$inferSelect;
