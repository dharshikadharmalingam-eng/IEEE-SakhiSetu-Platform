import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./accounts";

export const sakhiScoreHistoryTable = pgTable(
  "sakhi_score_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sakhi_score_history_user_idx").on(t.userId, t.createdAt)],
);

export const insertSakhiScoreHistorySchema = createInsertSchema(sakhiScoreHistoryTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSakhiScoreHistory = z.infer<typeof insertSakhiScoreHistorySchema>;
export type SakhiScoreHistory = typeof sakhiScoreHistoryTable.$inferSelect;
