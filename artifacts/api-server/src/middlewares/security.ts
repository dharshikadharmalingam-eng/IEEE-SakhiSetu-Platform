import type { NextFunction, Request, Response } from "express";

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  next();
}

const allowedOrigins = () => (process.env["CORS_ORIGIN"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Defence in depth for cookie sessions: reject state-changing requests from a foreign Origin. */
export function sameOriginWrites(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  try {
    if (new URL(origin).host === host || allowedOrigins().includes(origin)) return next();
  } catch {
    /* fall through */
  }
  res.status(403).json({ error: "Cross-origin request blocked." });
}
