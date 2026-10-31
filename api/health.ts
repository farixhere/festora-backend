import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env, allowedOrigins } from "../src/lib/env";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  return res.status(200).json({
    ok: true,
    service: "festora-backend",
    environment: env.APP_ENV,
    databaseConfigured: Boolean(env.DATABASE_URL)
  });
}