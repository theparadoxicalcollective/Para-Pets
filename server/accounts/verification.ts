import crypto from "crypto";
import { Resend } from "resend";
import type { User } from "@shared/schema";

export type EmailClient = { send(message: { from: string; to: string; subject: string; html: string }): Promise<{ error?: unknown }> };
type VerificationStorage = Pick<typeof import("../storage").storage, "prepareEmailVerification">;
const APP_URL = (process.env.APP_URL || "https://parapets.net").replace(/\/$/, "");
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Para Pets <noreply@parapets.net>";

export function createVerificationSender(storage: VerificationStorage, suppliedClient?: EmailClient) {
  return async (user: Pick<User, "id" | "email" | "username">): Promise<void> => {
    // Reuse an unexpired token. Concurrent sends and failed deliveries cannot
    // invalidate a link that is already in the player's inbox.
    const current = await storage.prepareEmailVerification(user.id, user.email, crypto.randomBytes(32).toString("hex"), new Date(Date.now() + 24 * 60 * 60 * 1000));
    if (!current) throw new Error("Account changed; refresh before requesting another email");
    const verifyUrl = `${APP_URL}/api/auth/verify-email/${current.emailVerificationToken}`;
    const username = current.username;
    const client = suppliedClient ?? new Resend(process.env.RESEND_API_KEY).emails;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        client.send({
          from: FROM_EMAIL,
          to: current.email,
          subject: "🐾 Para Pets — Verify Your Email",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Para Pets — Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0805;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0805;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${APP_URL}/logo_parapets.png" alt="Para Pets" width="180" style="display:block;max-width:180px;" />
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:linear-gradient(180deg,#1e1208 0%,#150d06 100%);border-radius:16px;border:1px solid #6a4a20;box-shadow:0 0 40px rgba(0,0,0,0.8),inset 0 1px 0 rgba(212,160,23,0.2);overflow:hidden;">

              <!-- Gold top accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:28px 32px 20px;background:linear-gradient(180deg,rgba(212,160,23,0.08) 0%,transparent 100%);">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#8a6a30;text-transform:uppercase;">Account Setup</p>
                    <h1 style="margin:0;font-size:26px;color:#f0c040;letter-spacing:2px;text-shadow:0 0 20px rgba(240,192,64,0.3);">Verify Your Email</h1>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.4),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 8px;font-size:15px;color:#c8a870;">
                      Welcome, <strong style="color:#f0c040;">${username}</strong>!
                    </p>
                    <p style="margin:0 0 24px;font-size:14px;color:#a89878;line-height:1.7;">
                      Thanks for joining Para Pets! Click the button below to verify your email address and unlock all rewards. Links expire within <strong style="color:#d4b896;">24 hours</strong>. If your link has expired, request a new one from the game.
                    </p>

                    <!-- CTA button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:8px 0 28px;">
                          <a href="${verifyUrl}"
                            style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#4a2d6f 0%,#2d1a4a 100%);color:#d4a8ff;text-decoration:none;border-radius:10px;font-size:16px;font-family:Georgia,serif;letter-spacing:1px;border:1px solid rgba(180,120,255,0.4);box-shadow:0 0 20px rgba(180,120,255,0.15),0 4px 16px rgba(0,0,0,0.5);">
                            ✦ &nbsp;Verify My Email&nbsp; ✦
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.2),transparent);margin-bottom:20px;"></div>

                    <!-- Note -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(106,72,32,0.3);">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#6a4820;text-transform:uppercase;">Didn't sign up?</p>
                          <p style="margin:0;font-size:13px;color:#7a6040;line-height:1.6;">
                            You can safely ignore this email — no account will be active without verification.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Bottom divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.3),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer link -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:20px 32px 28px;" align="center">
                    <p style="margin:0 0 10px;font-size:11px;color:#4a3820;letter-spacing:2px;">BUTTON NOT WORKING?</p>
                    <p style="margin:0;font-size:11px;color:#5a4828;word-break:break-all;line-height:1.6;">
                      <a href="${verifyUrl}" style="color:#6a7a50;">${verifyUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Gold bottom accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer below card -->
          <tr>
            <td align="center" style="padding:24px 16px 8px;">
              <p style="margin:0;font-size:11px;color:#3a2a18;letter-spacing:3px;">PARA PETS &copy; 2026</p>
              <p style="margin:6px 0 0;font-size:11px;color:#2a1e10;">
                <a href="${APP_URL}" style="color:#4a3820;text-decoration:none;">parapets.net</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Email delivery timed out")), 10_000); }),
      ]);
      if (result.error) throw new Error("Email provider rejected the verification message");
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
