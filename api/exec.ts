import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { allowedOrigins } from "../src/lib/env";

const requestSchema = z.object({
  action: z.string().trim().min(1).max(80),
  token: z.string().optional().default("")
}).passthrough();

const knownActions = new Set([
  "accounts", "addCoupon", "addUser", "ask", "buy", "checkPay",
  "claimPay", "couponLogin", "coupons", "createFest", "deleteFest",
  "deleteUser", "festInfo", "fests", "hit", "login", "logout",
  "myPlan", "organisers", "ownerStats", "public", "pull", "push",
  "redeem", "reviewPay", "sendOtp", "setAccount", "setCode",
  "setCoupon", "setPassword", "setSignup", "signup", "users"
]);

export default function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request. An action is required." });
  }

  const { action } = parsed.data;

  if (!knownActions.has(action)) {
    return res.status(400).json({ error: "Unknown API action." });
  }

  // Deliberately fail closed until each action has been implemented and tested.
  // This route preserves the existing frontend request/response envelope.
  return res.status(501).json({
    error: `The "${action}" action is not available in the replacement backend yet.`,
    code: "ACTION_NOT_IMPLEMENTED"
  });
}