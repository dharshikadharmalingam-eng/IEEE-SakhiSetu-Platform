import { and, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

export type NotificationType =
  | "assessment_ready"
  | "course_progress"
  | "course_completed"
  | "new_match"
  | "application_status"
  | "new_application"
  | "employer_verification"
  | "feedback_received"
  | "skill_verification"
  | "score_updated"
  | "report_update";

export async function notify(userId: number, type: NotificationType, title: string, body = "", link: string | null = null): Promise<void> {
  await db.insert(notificationsTable).values({ userId, type, title, body, link });
}

/** Insert a notification unless an identical one (same user, type, title, link) already exists. */
export async function notifyOnce(userId: number, type: NotificationType, title: string, body = "", link: string | null = null): Promise<void> {
  const existing = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.type, type), eq(notificationsTable.title, title)))
    .limit(1);
  if (!existing.length) await notify(userId, type, title, body, link);
}
