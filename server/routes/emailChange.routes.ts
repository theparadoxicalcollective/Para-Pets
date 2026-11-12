import type { Express, RequestHandler } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Resend } from "resend";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { users } from "@shared/schema";
import { accountEmailSchema } from "@shared/accountValidation";
import { db as defaultDb } from "../db";
import { isDedicatedQaTester } from "../qaTester";

const APP_URL = (process.env.APP_URL || "https://parapets.net").replace(/\/$/, "");
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Para Pets <noreply@parapets.net>";
const EXPIRATION_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const requestSchema = z.object({
  email: accountEmailSchema,
  currentPassword: z.string().min(1).max(1024),
});
const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

type EmailMessage = { from: string; to: string; subject: string; html: string };
type Dependencies = {
  db: typeof defaultDb;
  isAuthenticated: RequestHandler;
  sendEmail?: (message: EmailMessage) => Promise<{ error?: unknown }>;
};

/** Verify a NEW address before replacing the account's existing recovery email.
 * Pending email/token data remains server-side and never appears in publicAccount. */
export function registerEmailChangeRoutes(app: Express, deps: Dependencies): void {
  const { db, isAuthenticated } = deps;
  app.post("/api/user/email-change/request", isAuthenticated, async (req, res) => {
    if (isDedicatedQaTester(req.user as any)) {
      return res.status(403).json({ message: "This reserved QA account cannot change its email address." });
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and your current password." });
    const { email, currentPassword } = parsed.data;
    try {
      const userId = (req.user as { id: string }).id;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ message: "Account not found" });
      if (!(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(403).json({ message: "Current password is incorrect." });
      }
      if (user.email.toLowerCase() === email) {
        return res.status(400).json({ message: "This is already your account email." });
      }
      const [taken] = await db.select({ id: users.id }).from(users)
        .where(sql`lower(${users.email}) = ${email} AND ${users.id} <> ${userId}`).limit(1);
      if (taken) return res.status(409).json({ message: "That email is already registered." });
      const now = new Date();
      if (user.pendingEmailRequestedAt && now.getTime() - user.pendingEmailRequestedAt.getTime() < RETRY_MS) {
        return res.status(429).json({ message: "Please wait a minute before requesting another email link." });
      }
      if (!deps.sendEmail && !process.env.RESEND_API_KEY) {
        return res.status(503).json({ message: "Email verification is temporarily unavailable." });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const hash = tokenHash(token);
      const expires = new Date(now.getTime() + EXPIRATION_MS);
      // Compare the previous throttle time to prevent simultaneous requests
      // from bypassing the cooldown (a first-time request has NULL).
      const [updated] = await db.update(users).set({
        pendingEmail: email, pendingEmailTokenHash: hash,
        pendingEmailExpires: expires, pendingEmailRequestedAt: now,
      }).where(and(eq(users.id, userId), user.pendingEmailRequestedAt
        ? eq(users.pendingEmailRequestedAt, user.pendingEmailRequestedAt)
        : sql`${users.pendingEmailRequestedAt} IS NULL`)).returning({ id: users.id });
      if (!updated) return res.status(429).json({ message: "Please try again shortly." });

      const verifyUrl = `${APP_URL}/api/user/email-change/verify/${token}`;
      try {
        const send = deps.sendEmail ?? ((message: EmailMessage) =>
          new Resend(process.env.RESEND_API_KEY).emails.send(message));
        const result = await send({
          from: FROM_EMAIL, to: email, subject: "Para Pets — Confirm your new email",
          html: `<div style="font:16px Georgia,serif;background:#102b1b;color:#f1dca8;padding:26px;border:1px solid #b99a54;border-radius:12px">
            <h2 style="color:#f2cf77">Confirm your new Para Pets email</h2>
            <p>Someone with your account password requested this change. Your current email stays active until you confirm.</p>
            <p><a href="${verifyUrl}" style="color:#ffe3a0">Confirm my new email address</a></p>
            <p>This link expires in 24 hours. If you didn't request it, ignore this message.</p>
          </div>`,
        });
        if (result.error) throw new Error("Email delivery failed");
      } catch (error) {
        // Clear only this request: never erase a newer pending token.
        await db.update(users).set({
          pendingEmail: null, pendingEmailTokenHash: null, pendingEmailExpires: null,
        }).where(and(eq(users.id, userId), eq(users.pendingEmailTokenHash, hash)));
        console.error("Email change verification delivery failed:", error);
        return res.status(503).json({ message: "Unable to send verification email. Try again shortly." });
      }
      return res.json({ message: "Check your new email for a confirmation link. Your current email has not changed." });
    } catch (error) {
      console.error("Email change request failed:", error);
      return res.status(500).json({ message: "Unable to request an email change." });
    }
  });

  app.get("/api/user/email-change/verify/:token", async (req, res) => {
    const token = req.params.token;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return res.redirect(`${APP_URL}/?email-change=invalid`);
    }
    try {
      const hash = tokenHash(token);
      const result = await db.transaction(async tx => {
        const [pending] = await tx.select().from(users).where(and(
          eq(users.pendingEmailTokenHash, hash), gt(users.pendingEmailExpires, new Date()),
        )).limit(1);
        if (!pending?.pendingEmail) return "invalid" as const;
        // Prevent concurrent confirmations for the same case-insensitive
        // address from overwriting a verified user's identity.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(7802, hashtext(${pending.pendingEmail}))`);
        const [used] = await tx.select({ id: users.id }).from(users)
          .where(sql`lower(${users.email}) = ${pending.pendingEmail} AND ${users.id} <> ${pending.id}`).limit(1);
        if (used) return "unavailable" as const;
        const [updated] = await tx.update(users).set({
          email: pending.pendingEmail, emailVerified: true,
          pendingEmail: null, pendingEmailTokenHash: null, pendingEmailExpires: null,
          pendingEmailRequestedAt: null,
        }).where(and(eq(users.id, pending.id), eq(users.pendingEmailTokenHash, hash),
          gt(users.pendingEmailExpires, new Date()))).returning({ id: users.id });
        return updated ? "verified" as const : "invalid" as const;
      });
      return res.redirect(`${APP_URL}/?email-change=${result}`);
    } catch (error) {
      console.error("Email change confirmation failed:", error);
      return res.redirect(`${APP_URL}/?email-change=error`);
    }
  });
}
