// @ts-nocheck
import nodemailer from "nodemailer";
import { env } from "./env";

// Email can be sent either through Gmail SMTP (no domain needed) or through
// Resend (needs a verified domain). Gmail SMTP is used whenever SMTP_USER and
// SMTP_PASS are set; otherwise the original Resend settings are used.
const useSmtp = () => Boolean(env.SMTP_USER && env.SMTP_PASS);

export const mailConfigured = () => useSmtp() || Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (useSmtp()) {
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST || "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, "") }
      });
      await transport.sendMail({ from: env.SMTP_FROM || `Festora <${env.SMTP_USER}>`, to, subject, html });
      return true;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html })
    });
    return res.ok;
  } catch {
    return false;
  }
}
