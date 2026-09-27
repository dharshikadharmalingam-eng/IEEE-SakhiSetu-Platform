import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { LoginBody, RegisterBody } from "@workspace/api-zod";
import { db, employerVerificationsTable, employersTable, userSkillsTable, usersTable, womenProfilesTable } from "@workspace/db";
import { clearLoginFailures, endSession, hashPassword, me, recordLoginFailure, startSession, throttleLogin, verifyPassword, type AuthUser } from "../lib/auth";
import { EMAIL_RE, HttpError, isHttpUrl, optionalText, parse, requireText, validPassword } from "../lib/http";
import { ensureSkill } from "../lib/catalog";
import { refreshScore, currentScore } from "../lib/learner";
import { aiEnabled, AI_LABEL } from "../lib/ai";

const router: IRouter = Router();
const PHONE_RE = /^[+]?[0-9 ()-]{7,20}$/;

function userDto(u: AuthUser, employerStatus?: string) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, role: u.role, employerId: u.employerId, employerVerificationStatus: employerStatus as "Pending" | "Verified" | "Rejected" | undefined };
}

async function employerStatusFor(userId: number) {
  const [e] = await db.select({ id: employersTable.id, s: employersTable.verificationStatus }).from(employersTable).where(eq(employersTable.userId, userId));
  return e;
}

router.post("/auth/register", async (req, res) => {
  const body = parse(RegisterBody, req.body);
  const email = requireText(body.email, "Email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  validPassword(body.password);
  const phone = requireText(body.phone, "Phone", 20);
  if (!PHONE_RE.test(phone)) throw new HttpError(400, "Please enter a valid phone number.");
  const [taken] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (taken) throw new HttpError(409, "An account with this email already exists. Try signing in instead.");
  const passwordHash = await hashPassword(body.password);

  if (body.role === "woman") {
    const name = requireText(body.name, "Name", 100);
    const city = requireText(body.city, "City", 100);
    const skillInputs = (body.skills ?? []).slice(0, 20);
    const userId = await db.transaction(async (tx) => {
      const [u] = await tx.insert(usersTable).values({ role: "woman", name, email, phone, passwordHash }).returning({ id: usersTable.id });
      await tx.insert(womenProfilesTable).values({
        userId: u!.id, city, area: optionalText(body.area, "Area", 100) ?? "", education: optionalText(body.education, "Education", 100) ?? "",
        employmentStatus: optionalText(body.employmentStatus, "Employment status", 100) ?? "", interests: (body.interests ?? []).map((i) => i.trim()).filter(Boolean).slice(0, 15),
        workPreferences: (body.workPreferences ?? []).slice(0, 6), availability: optionalText(body.availability, "Availability", 200) ?? "", goal: optionalText(body.goal, "Goal", 500) ?? "",
      });
      return u!.id;
    });
    const seen = new Set<string>();
    for (const s of skillInputs) {
      const skill = await ensureSkill(s.name);
      if (seen.has(skill.name.toLowerCase())) continue;
      seen.add(skill.name.toLowerCase());
      await db.insert(userSkillsTable).values({ userId, skillId: skill.id, level: (s.level ?? "Comfortable").slice(0, 40), yearsExperience: Math.max(0, Math.min(60, Math.round(s.yearsExperience ?? 0))) });
    }
    await currentScore(userId); // records the "Initial profile" score snapshot
    await refreshScore(userId, "Profile created").catch(() => undefined);
    await startSession(res, userId);
    res.status(201).json(userDto({ id: userId, role: "woman", name, email, phone, status: "active" }));
    return;
  }

  const businessName = requireText(body.businessName, "Business name", 120);
  const employerName = requireText(body.employerName, "Employer name", 100);
  const info = requireText(body.verificationInfo, "Verification information", 2000);
  const evidenceUrl = body.evidenceUrl?.trim() || null;
  if (evidenceUrl && !isHttpUrl(evidenceUrl)) throw new HttpError(400, "Evidence link must start with http:// or https://");
  const created = await db.transaction(async (tx) => {
    const [u] = await tx.insert(usersTable).values({ role: "employer", name: employerName, email, phone, passwordHash }).returning({ id: usersTable.id });
    const [e] = await tx.insert(employersTable).values({
      userId: u!.id, businessName, employerName, location: requireText(body.location, "Location", 100), businessType: requireText(body.businessType, "Business type", 100),
      description: optionalText(body.description, "Description", 2000) ?? "",
    }).returning({ id: employersTable.id });
    await tx.insert(employerVerificationsTable).values({ employerId: e!.id, status: "Pending", submittedInfo: info, evidenceUrl });
    return { userId: u!.id, employerId: e!.id };
  });
  await startSession(res, created.userId);
  res.status(201).json(userDto({ id: created.userId, role: "employer", name: employerName, email, phone, status: "active", employerId: created.employerId }, "Pending"));
});

router.post("/auth/login", async (req, res) => {
  const body = parse(LoginBody, req.body);
  const email = body.email.trim().toLowerCase();
  const key = `${req.ip}|${email}`;
  throttleLogin(key);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = await verifyPassword(body.password, u?.passwordHash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==");
  if (!u || !ok) {
    recordLoginFailure(key);
    throw new HttpError(401, "That email and password do not match.");
  }
  if (u.status !== "active") throw new HttpError(403, "This account has been suspended. Please contact SakhiSetu support.");
  clearLoginFailures(key);
  await startSession(res, u.id);
  const emp = u.role === "employer" ? await employerStatusFor(u.id) : undefined;
  res.json(userDto({ id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, status: u.status, employerId: emp?.id }, emp?.s));
});

router.post("/auth/logout", async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res) => {
  const u = me(req);
  const emp = u.role === "employer" ? await employerStatusFor(u.id) : undefined;
  res.json(userDto(u, emp?.s));
});

router.get("/auth/demo", async (_req, res) => {
  if (process.env["DEMO_MODE"] !== "true") {
    res.json({ enabled: false, accounts: [] });
    return;
  }
  const password = process.env["DEMO_PASSWORD"] || "SakhiDemo2026";
  const accounts = await db.select({ role: usersTable.role, name: usersTable.name, email: usersTable.email }).from(usersTable).where(sql`${usersTable.email} like '%@demo.sakhisetu.example'`);
  res.json({ enabled: true, accounts: accounts.map((a) => ({ role: a.role, label: a.name, email: a.email, password })) });
});

router.get("/ai/status", (_req, res) => {
  res.json({ enabled: aiEnabled(), label: AI_LABEL });
});

export default router;
