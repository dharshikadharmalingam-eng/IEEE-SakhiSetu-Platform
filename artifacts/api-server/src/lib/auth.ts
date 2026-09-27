import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, employersTable, sessionsTable, usersTable, type User } from "@workspace/db";
import { HttpError } from "./http";
import { logger } from "./logger";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export const COOKIE_NAME = "sakhi_session";
const SESSION_DAYS = 7;

let secret: string | undefined;
function sessionSecret(): string {
  if (secret) return secret;
  const fromEnv = process.env["SESSION_SECRET"];
  if (fromEnv && fromEnv.length >= 16) {
    secret = fromEnv;
  } else if (process.env["NODE_ENV"] === "production") {
    throw new Error("SESSION_SECRET (at least 16 characters) must be set in production.");
  } else {
    secret = randomBytes(32).toString("hex");
    logger.warn("SESSION_SECRET is not set; using an ephemeral secret. Sessions will not survive a restart.");
  }
  return secret;
}
export function assertAuthConfig(): void {
  sessionSecret();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { ...SCRYPT, N: Number(n) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sessionId = (token: string) => createHmac("sha256", sessionSecret()).update(token).digest("hex");

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env["NODE_ENV"] === "production" || process.env["COOKIE_SECURE"] === "true",
  path: "/",
});

export async function startSession(res: Response, userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessionsTable).values({ id: sessionId(token), userId, expiresAt });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, userId));
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), expires: expiresAt });
  void db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date())).catch(() => undefined);
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string") await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId(token)));
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

export type AuthUser = Pick<User, "id" | "role" | "name" | "email" | "phone" | "status"> & { employerId?: number };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Resolve the session cookie (if any) to req.user. Never throws for anonymous requests. */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string" && token.length > 10) {
    const [row] = await db
      .select({ id: usersTable.id, role: usersTable.role, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, status: usersTable.status })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
      .where(and(eq(sessionsTable.id, sessionId(token)), gt(sessionsTable.expiresAt, new Date())))
      .limit(1);
    if (row && row.status === "active") {
      const user: AuthUser = { ...row };
      if (row.role === "employer") {
        const [emp] = await db.select({ id: employersTable.id }).from(employersTable).where(eq(employersTable.userId, row.id)).limit(1);
        user.employerId = emp?.id;
      }
      req.user = user;
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new HttpError(401, "Please sign in to continue.");
  next();
}

export function requireRole(...roles: Array<AuthUser["role"]>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new HttpError(401, "Please sign in to continue.");
    if (!roles.includes(req.user.role)) throw new HttpError(403, "You do not have access to this area.");
    next();
  };
}

/** Typed accessor for handlers mounted behind requireAuth / requireRole. */
export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Please sign in to continue.");
  return req.user;
}

// --- login throttling (in-memory, per process) -----------------------------
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

export function throttleLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    throw new HttpError(429, "Too many sign-in attempts. Please wait a few minutes and try again.");
  }
}
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}
export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
