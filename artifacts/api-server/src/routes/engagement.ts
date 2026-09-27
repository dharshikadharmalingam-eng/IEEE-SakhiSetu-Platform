import { Router, type IRouter } from "express";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { CreateFeedbackBody, CreateReportBody, MarkNotificationReadParams } from "@workspace/api-zod";
import type { Feedback, Report } from "@workspace/api-zod";
import { applicationsTable, db, employersTable, feedbackTable, notificationsTable, opportunitiesTable, reportsTable, usersTable } from "@workspace/db";
import { me, requireAuth, requireRole } from "../lib/auth";
import { HttpError, optionalText, parse, requireText } from "../lib/http";
import { refreshScore } from "../lib/learner";
import { notify } from "../lib/notify";

const router: IRouter = Router();

// ---- feedback ---------------------------------------------------------------
const CATEGORY_RULES = {
  employer_to_woman: ["communication", "reliability", "skillPerformance"],
  woman_to_employer: ["communication", "reliability", "workEnvironment"],
} as const;

router.post("/feedback", requireRole("woman", "employer"), async (req, res) => {
  const user = me(req);
  const b = parse(CreateFeedbackBody, req.body);
  const [row] = await db
    .select({ a: applicationsTable, o: opportunitiesTable, e: employersTable })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId))
    .where(eq(applicationsTable.id, b.applicationId));
  if (!row) throw new HttpError(404, "Application not found.");
  const direction = user.role === "woman" && row.a.userId === user.id ? "woman_to_employer" : user.role === "employer" && row.e.userId === user.id ? "employer_to_woman" : null;
  if (!direction) throw new HttpError(403, "You can only give feedback on your own applications or opportunities.");
  if (row.a.status !== "Selected" || !row.a.completedAt) throw new HttpError(409, "Feedback opens once the employer marks the work as completed.");
  const allowed = CATEGORY_RULES[direction] as readonly string[];
  const entries = Object.entries(b.ratings).filter(([, v]) => v !== undefined) as Array<[string, number]>;
  if (!entries.length) throw new HttpError(400, "Please rate at least one category.");
  const bad = entries.find(([k]) => !allowed.includes(k));
  if (bad) throw new HttpError(400, `"${bad[0]}" is not a feedback category for this direction.`);
  const [dup] = await db.select({ id: feedbackTable.id }).from(feedbackTable).where(and(eq(feedbackTable.applicationId, row.a.id), eq(feedbackTable.direction, direction)));
  if (dup) throw new HttpError(409, "You have already shared feedback for this work.");
  const rating = Math.round((entries.reduce((t, [, v]) => t + v, 0) / entries.length) * 10) / 10;
  const toUserId = direction === "employer_to_woman" ? row.a.userId : row.e.userId;
  const [f] = await db.insert(feedbackTable).values({
    applicationId: row.a.id, opportunityId: row.o.id, employerId: row.e.id, fromUserId: user.id, toUserId, direction, ratings: Object.fromEntries(entries), rating,
    comment: optionalText(b.comment, "Comment", 1000) ?? "",
  }).returning();
  await notify(toUserId, "feedback_received", `Feedback received for ${row.o.title}`, "Open Feedback to read it.", "/feedback");
  if (direction === "employer_to_woman") await refreshScore(toUserId, "Employer feedback received");
  res.status(201).json(feedbackDto(f!, row.o.title, direction === "employer_to_woman" ? user.name : row.e.businessName));
});

function feedbackDto(f: typeof feedbackTable.$inferSelect, opportunityTitle: string, counterpart: string): Feedback {
  return { id: f.id, applicationId: f.applicationId, opportunityTitle, counterpart, direction: f.direction, ratings: f.ratings, rating: f.rating, comment: f.comment, createdAt: f.createdAt.toISOString() };
}

router.get("/feedback", requireRole("woman", "employer"), async (req, res) => {
  const user = me(req);
  const rows = await db
    .select({ f: feedbackTable, o: opportunitiesTable, e: employersTable, wu: usersTable })
    .from(feedbackTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, feedbackTable.opportunityId))
    .innerJoin(employersTable, eq(employersTable.id, feedbackTable.employerId))
    .innerJoin(applicationsTable, eq(applicationsTable.id, feedbackTable.applicationId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.userId))
    .where(or(eq(feedbackTable.toUserId, user.id), eq(feedbackTable.fromUserId, user.id)))
    .orderBy(desc(feedbackTable.createdAt));
  // Show the other party's public name: the business for women, the applicant's first name for employers.
  const label = (r: (typeof rows)[number]) => (user.role === "woman" ? r.e.businessName : r.wu.name.split(" ")[0]!);
  const dueRows = await db
    .select({ a: applicationsTable, o: opportunitiesTable, e: employersTable, wu: usersTable })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.userId))
    .where(and(isNotNull(applicationsTable.completedAt), eq(applicationsTable.status, "Selected"), user.role === "woman" ? eq(applicationsTable.userId, user.id) : eq(employersTable.userId, user.id)));
  const myDirection = user.role === "woman" ? "woman_to_employer" : "employer_to_woman";
  const givenApps = new Set(rows.filter((r) => r.f.fromUserId === user.id && r.f.direction === myDirection).map((r) => r.f.applicationId));
  res.json({
    received: rows.filter((r) => r.f.toUserId === user.id).map((r) => feedbackDto(r.f, r.o.title, label(r))),
    given: rows.filter((r) => r.f.fromUserId === user.id).map((r) => feedbackDto(r.f, r.o.title, label(r))),
    due: dueRows.filter((r) => !givenApps.has(r.a.id)).map((r) => ({ applicationId: r.a.id, opportunityTitle: r.o.title, counterpart: user.role === "woman" ? r.e.businessName : r.wu.name.split(" ")[0]!, completedAt: r.a.completedAt!.toISOString() })),
  });
});

// ---- reports ----------------------------------------------------------------
export async function reportTargetLabel(type: string, id: number): Promise<string> {
  if (type === "employer") {
    const [e] = await db.select({ n: employersTable.businessName }).from(employersTable).where(eq(employersTable.id, id));
    return e ? `Employer: ${e.n}` : `Employer #${id} (removed)`;
  }
  if (type === "opportunity") {
    const [o] = await db.select({ t: opportunitiesTable.title }).from(opportunitiesTable).where(eq(opportunitiesTable.id, id));
    return o ? `Opportunity: ${o.t}` : `Opportunity #${id} (removed)`;
  }
  if (type === "feedback") return `Feedback #${id}`;
  return "General content";
}

export async function reportDto(r: typeof reportsTable.$inferSelect, reporterName?: string): Promise<Report> {
  return {
    id: r.id, targetType: r.targetType, targetId: r.targetId, targetLabel: await reportTargetLabel(r.targetType, r.targetId), reason: r.reason, description: r.description,
    status: r.status, resolutionNote: r.resolutionNote, reporterName, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

router.post("/reports", requireRole("woman", "employer"), async (req, res) => {
  const user = me(req);
  const b = parse(CreateReportBody, req.body);
  const reason = requireText(b.reason, "Reason", 120);
  const description = optionalText(b.description, "Description", 2000) ?? "";
  if (b.targetType === "content" && !description) throw new HttpError(400, "Please describe the content you are reporting.");
  if (b.targetType === "employer") {
    const [e] = await db.select({ id: employersTable.id, userId: employersTable.userId }).from(employersTable).where(eq(employersTable.id, b.targetId));
    if (!e) throw new HttpError(404, "Employer not found.");
    if (e.userId === user.id) throw new HttpError(400, "You cannot report yourself.");
  } else if (b.targetType === "opportunity") {
    const [o] = await db.select({ id: opportunitiesTable.id, employerUser: employersTable.userId }).from(opportunitiesTable).innerJoin(employersTable, eq(employersTable.id, opportunitiesTable.employerId)).where(eq(opportunitiesTable.id, b.targetId));
    if (!o) throw new HttpError(404, "Opportunity not found.");
    if (o.employerUser === user.id) throw new HttpError(400, "You cannot report your own opportunity.");
  } else if (b.targetType === "feedback") {
    const [f] = await db.select({ f: feedbackTable.id }).from(feedbackTable).where(and(eq(feedbackTable.id, b.targetId), or(eq(feedbackTable.toUserId, user.id), eq(feedbackTable.fromUserId, user.id))));
    if (!f) throw new HttpError(404, "Feedback not found.");
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(reportsTable).where(and(eq(reportsTable.reporterId, user.id), sql`${reportsTable.createdAt} > now() - interval '1 day'`));
  if (n >= 20) throw new HttpError(429, "You have reached today's reporting limit. Please try again tomorrow.");
  const [r] = await db.insert(reportsTable).values({ reporterId: user.id, targetType: b.targetType, targetId: b.targetType === "content" ? 0 : b.targetId, reason, description }).returning();
  const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
  for (const a of admins) await notify(a.id, "report_update", "New safety report", `${reason} — ${await reportTargetLabel(r!.targetType, r!.targetId)}`, "/admin/reports");
  res.status(201).json(await reportDto(r!));
});

router.get("/reports", requireRole("woman", "employer"), async (req, res) => {
  const rows = await db.select().from(reportsTable).where(eq(reportsTable.reporterId, me(req).id)).orderBy(desc(reportsTable.createdAt));
  res.json(await Promise.all(rows.map((r) => reportDto(r))));
});

// ---- notifications ------------------------------------------------------------
const notifDto = (n: typeof notificationsTable.$inferSelect) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() });

router.get("/notifications", requireAuth, async (req, res) => {
  const user = me(req);
  const items = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, user.id)).orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id)).limit(50);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), sql`${notificationsTable.readAt} is null`));
  res.json({ unreadCount: n, items: items.map(notifDto) });
});

router.put("/notifications/read-all", requireAuth, async (req, res) => {
  await db.update(notificationsTable).set({ readAt: new Date() }).where(and(eq(notificationsTable.userId, me(req).id), sql`${notificationsTable.readAt} is null`));
  res.json({ ok: true });
});

router.put("/notifications/:id/read", requireAuth, async (req, res) => {
  const { id } = parse(MarkNotificationReadParams, req.params);
  const [n] = await db.update(notificationsTable).set({ readAt: new Date() }).where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, me(req).id))).returning();
  if (!n) throw new HttpError(404, "Notification not found.");
  res.json(notifDto(n));
});

export default router;
