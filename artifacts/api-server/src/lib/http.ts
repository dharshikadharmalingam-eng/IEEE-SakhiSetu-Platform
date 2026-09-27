import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}

/** Validate untrusted input with a generated zod schema; throws a 400 HttpError listing each problem. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
  throw new HttpError(400, "Please check the highlighted details and try again.", details);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireText(value: string | undefined | null, label: string, max = 200): string {
  const v = (value ?? "").trim();
  if (!v) throw new HttpError(400, `${label} is required.`);
  if (v.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return v;
}

export function optionalText(value: string | undefined | null, label: string, max = 2000): string | undefined {
  if (value === undefined || value === null) return undefined;
  const v = value.trim();
  if (v.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return v;
}

export function validPassword(password: string): void {
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Password must be 8–128 characters and include at least one letter and one number.");
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function numId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id.");
  return n;
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    res.status(400).json({ error: "Request body must be valid JSON." });
    return;
  }
  logger.error({ err, url: req.url?.split("?")[0] }, "Unhandled error");
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}
