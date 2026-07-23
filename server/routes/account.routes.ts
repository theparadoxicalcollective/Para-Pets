import type { Express, RequestHandler } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import sharp from "sharp";
import { Resend } from "resend";
import { createRegisteredUser } from "../registration";

type AccountStorage = Pick<typeof import("../storage").storage,
  | "addCoins"
  | "clearPasswordResetToken"
  | "createUser"
  | "getUser"
  | "getUserByEmail"
  | "getUserByEmailVerificationToken"
  | "getUserByResetToken"
  | "getUserByUsernameCaseInsensitive"
  | "grantUserHouseBundle"
  | "setActiveHouseBundle"
  | "setEmailVerificationToken"
  | "setPasswordResetToken"
  | "setWelcomeV2Sent"
  | "updatePassword"
  | "verifyEmail"
>;

type EmailClient = { send(message: { from: string; to: string; subject: string; html: string }): Promise<{ error?: unknown }> };
type FreeHouseBundle = { id: string };

export interface AccountRouteDependencies {
  storage: AccountStorage;
  isAuthenticated: RequestHandler;
  containsBadWord(username: string): Promise<boolean>;
  findRecentlyDeletedAccounts(email: string): Promise<{ deletedAt: Date }[]>;
  getFreeHouseBundles(): Promise<FreeHouseBundle[]>;
  updateSignupReferrer(userId: string, referrer: string): Promise<unknown>;
  grantWelcomeV2Bundle(userId: string): Promise<void>;
  postWatcherMessage(message: string): Promise<void>;
  emailClient?: EmailClient;
}

const APP_URL = process.env.APP_URL || "https://parapets.net";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Para Pets <noreply@parapets.net>";

export function registerAccountRoutes(app: Express, dependencies: AccountRouteDependencies): void {
  const {
    storage: accountStorage,
    isAuthenticated,
    containsBadWord,
    findRecentlyDeletedAccounts,
    getFreeHouseBundles,
    updateSignupReferrer,
    grantWelcomeV2Bundle,
    postWatcherMessage,
    emailClient = new Resend(process.env.RESEND_API_KEY).emails,
  } = dependencies;

// ── Email verification helper ─────────────────────────────────────────────────
async function sendVerificationEmail(userId: string, email: string, username: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await accountStorage.setEmailVerificationToken(userId, token, expires);
  const verifyUrl = `${APP_URL}/api/auth/verify-email/${token}`;
  await emailClient.send({
    from: FROM_EMAIL,
    to: email,
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
                      Thanks for joining Para Pets! Click the button below to verify your email address and unlock all rewards. This link is valid for <strong style="color:#d4b896;">24 hours</strong>.
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
  });
}

function categorizeReferrer(ref: string | null | undefined): string {
  if (!ref) return "Direct";
  const r = ref.toLowerCase();
  if (r.includes("google")) return "Google";
  if (r.includes("facebook") || r.includes("fb.com")) return "Facebook";
  if (r.includes("twitter") || r.includes("x.com")) return "Twitter/X";
  if (r.includes("instagram")) return "Instagram";
  if (r.includes("tiktok")) return "TikTok";
  if (r.includes("youtube")) return "YouTube";
  if (r.includes("reddit")) return "Reddit";
  return "Other";
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, profileImageData, referrer } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(username)) {
      return res.status(400).json({ field: "username", message: "Username can only contain letters, numbers, underscores, and periods (periods cannot be at the start or end)" });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ field: "username", message: "Username must be between 3 and 20 characters" });
    }

    if (await containsBadWord(username)) {
      return res.status(400).json({ field: "username", message: "That username contains a forbidden word. Please choose another." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ field: "email", message: "Please enter a valid email address" });
    }

    if (password.length < 6) {
      return res.status(400).json({ field: "password", message: "Password must be at least 6 characters" });
    }

    const existingUsername = await accountStorage.getUserByUsernameCaseInsensitive(username);
    if (existingUsername) {
      return res.status(400).json({ field: "username", message: "That username is already taken. Please choose another." });
    }

    const existingEmail = await accountStorage.getUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ field: "email", message: "That email is already registered. Try logging in instead." });
    }

    const deletedRows = await findRecentlyDeletedAccounts(email);
    if (deletedRows.length > 0) {
      const eligibleAt = new Date(deletedRows[0].deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((eligibleAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ field: "email", message: `This email was used on a recently deleted account. You can register again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.` });
    }

    let profileImagePath: string | null = null;

    if (profileImageData) {
      try {
        const base64Data = profileImageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(imageBuffer)
          .resize(500, 500, { fit: "cover", position: "center" })
          .jpeg({ quality: 85 })
          .toBuffer();
        profileImagePath = `data:image/jpeg;base64,${resized.toString("base64")}`;
      } catch (imgErr) {
        console.error("Image processing error:", imgErr);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await accountStorage.createUser(createRegisteredUser({
      username,
      email,
      password: hashedPassword,
      profileImage: profileImagePath,
    }));

    try {
      await grantWelcomeV2Bundle(user.id);
    } catch (rewardErr) {
      console.error("Failed to create welcome reward, giving coins directly:", rewardErr);
      await accountStorage.addCoins(user.id, 500);
      await accountStorage.setWelcomeV2Sent(user.id);
    }

    // Auto-grant all free house bundles and set the first one as active
    try {
      const freeBundles = await getFreeHouseBundles();
      let firstBundleId: string | null = null;
      for (const bundle of freeBundles) {
        await accountStorage.grantUserHouseBundle(user.id, bundle.id);
        if (!firstBundleId) firstBundleId = bundle.id;
      }
      if (firstBundleId) await accountStorage.setActiveHouseBundle(user.id, firstBundleId);
    } catch (bundleErr) {
      console.error("Failed to auto-grant free house bundle:", bundleErr);
    }

    // Store categorized signup source
    const refSource = categorizeReferrer(referrer);
    updateSignupReferrer(user.id, refSource).catch(() => {});

    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: "Login failed after registration" });
      sendVerificationEmail(user.id, user.email, user.username)
        .catch(e => console.error("Verification email failed:", e));
      const { password: _, ...safeUser } = user;
      return res.status(201).json(safeUser);
    });
  } catch (err: any) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: "Logout failed" });
    return res.json({ message: "Logged out" });
  });
});

app.get("/api/auth/reset-password/:token", async (req, res) => {
  try {
    const user = await accountStorage.getUserByResetToken((req.params.token as string));
    if (!user) {
      return res.status(404).json({ valid: false, message: "Invalid or expired reset link" });
    }
    if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
      await accountStorage.clearPasswordResetToken(user.id);
      return res.status(400).json({ valid: false, message: "Reset link has expired" });
    }
    return res.json({ valid: true });
  } catch (err) {
    console.error("Validate reset token error:", err);
    return res.status(500).json({ valid: false, message: "Failed to validate token" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const user = await accountStorage.getUserByResetToken(token);
    if (!user) {
      return res.status(404).json({ message: "Invalid or expired reset link" });
    }
    if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
      await accountStorage.clearPasswordResetToken(user.id);
      return res.status(400).json({ message: "Reset link has expired" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await accountStorage.updatePassword(user.id, hashedPassword);
    await accountStorage.clearPasswordResetToken(user.id);
    return res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Failed to reset password" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { emailOrUsername } = req.body;
    if (!emailOrUsername || typeof emailOrUsername !== "string") {
      return res.status(400).json({ message: "Email or username is required" });
    }
    const input = emailOrUsername.trim().toLowerCase();
    let user = await accountStorage.getUserByEmail(input);
    if (!user) {
      user = await accountStorage.getUserByUsernameCaseInsensitive(input);
    }
    // Always return success to prevent email/username enumeration
    if (!user || !user.email) {
      return res.json({ message: "If that account exists, a reset link has been sent" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await accountStorage.setPasswordResetToken(user.id, token, expires);
    const resetUrl = `${APP_URL}/reset-password/${token}`;
    const emailResult = await emailClient.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: "🐾 Para Pets — Password Reset",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Para Pets — Password Reset</title>
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

            <!-- Header band -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:28px 32px 20px;background:linear-gradient(180deg,rgba(212,160,23,0.08) 0%,transparent 100%);">
                  <p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#8a6a30;text-transform:uppercase;">Account Security</p>
                  <h1 style="margin:0;font-size:26px;color:#f0c040;letter-spacing:2px;text-shadow:0 0 20px rgba(240,192,64,0.3);">Password Reset</h1>
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
                    Greetings, <strong style="color:#f0c040;">${user.username}</strong>!
                  </p>
                  <p style="margin:0 0 24px;font-size:14px;color:#a89878;line-height:1.7;">
                    A password reset was requested for your Para Pets account. Click the button below to choose a new password. This link is valid for <strong style="color:#d4b896;">1 hour</strong> — after that it will expire and you'll need to request a new one.
                  </p>

                  <!-- CTA button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 28px;">
                        <a href="${resetUrl}"
                          style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2d6a4f 0%,#1a4a2e 100%);color:#7fffd4;text-decoration:none;border-radius:10px;font-size:16px;font-family:Georgia,serif;letter-spacing:1px;border:1px solid rgba(127,255,212,0.4);box-shadow:0 0 20px rgba(127,255,212,0.15),0 4px 16px rgba(0,0,0,0.5);">
                          ✦ &nbsp;Reset My Password&nbsp; ✦
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Divider -->
                  <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.2),transparent);margin-bottom:20px;"></div>

                  <!-- Safety note -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(106,72,32,0.3);">
                    <tr>
                      <td style="padding:16px 18px;">
                        <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#6a4820;text-transform:uppercase;">Didn't request this?</p>
                        <p style="margin:0;font-size:13px;color:#7a6040;line-height:1.6;">
                          You can safely ignore this email — your password will remain unchanged and your account is secure.
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

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:20px 32px 28px;" align="center">
                  <p style="margin:0 0 10px;font-size:11px;color:#4a3820;letter-spacing:2px;">BUTTON NOT WORKING?</p>
                  <p style="margin:0;font-size:11px;color:#5a4828;word-break:break-all;line-height:1.6;">
                    <a href="${resetUrl}" style="color:#6a7a50;">${resetUrl}</a>
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
    });
    if (emailResult.error) {
      console.error("Forgot password email send error:", emailResult.error);
    }
    // Always return success — never reveal whether the account/email exists
    return res.json({ message: "If that account exists, a reset link has been sent" });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
});

// ── Email verification — click link from email ────────────────────────────
app.get("/api/auth/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params as { token: string };
    const user = await accountStorage.getUserByEmailVerificationToken(token);
    if (!user) {
      return res.redirect(`${APP_URL}/?verified=invalid`);
    }
    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      return res.redirect(`${APP_URL}/?verified=expired`);
    }
    if (user.emailVerified) {
      return res.redirect(`${APP_URL}/?verified=already`);
    }
    await accountStorage.verifyEmail(user.id);
    // Update session user if logged in as this user
    if ((req.user as any)?.id === user.id) {
      (req.user as any).emailVerified = true;
    }
    // Veridian Watcher welcome message (fire-and-forget)
    if (user.watcherShoutoutsEnabled !== false) {
      postWatcherMessage(`𖢻 A new soul stirs in the realm — welcome, ${user.username}! May your journey through Para Pets be filled with wonder and discovery. The wilds await you...`).catch(() => {});
    }
    return res.redirect(`${APP_URL}/?verified=1`);
  } catch (err) {
    console.error("Verify email error:", err);
    return res.redirect(`${APP_URL}/?verified=error`);
  }
});

// ── Resend verification email (60-second cooldown) ────────────────────────
app.post("/api/auth/resend-verification", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const fullUser = await accountStorage.getUser(user.id);
    if (!fullUser) return res.status(404).json({ message: "User not found" });
    if (fullUser.emailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }
    // Cooldown: if token was issued less than 60 seconds ago, reject
    if (fullUser.emailVerificationExpires) {
      const issuedAt = fullUser.emailVerificationExpires.getTime() - 24 * 60 * 60 * 1000;
      const cooldownUntil = issuedAt + 60 * 1000;
      if (Date.now() < cooldownUntil) {
        const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
        return res.status(429).json({ message: `Please wait ${secondsLeft}s before resending`, secondsLeft });
      }
    }
    await sendVerificationEmail(fullUser.id, fullUser.email, fullUser.username);
    return res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ message: "Failed to send verification email" });
  }
});

}
