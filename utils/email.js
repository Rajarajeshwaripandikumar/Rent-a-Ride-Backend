// backend/utils/email.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a password reset email using Resend API.
 *
 * @param {string} to - recipient email
 * @param {string} resetUrl - URL used for password reset
 * @param {object} opts - { isVendor: boolean }
 */
export async function sendResetEmail(to, resetUrl, opts = {}) {
  try {
    const isVendor = !!opts.isVendor;

    const subject = isVendor ? "Vendor Password Reset" : "Password Reset";
    const greeting = isVendor ? "Hello Vendor," : "Hello,";
    const supportText = isVendor
      ? "If you did not request this reset, contact vendor support."
      : "If you did not request this reset, please contact our support.";

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111;">
        <h3>${greeting}</h3>
        <p>You requested a password reset. Click the button below:</p>

        <p style="text-align:center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="display:inline-block; padding:12px 20px; background:#0071DC;
                    color:#fff; border-radius:6px; text-decoration:none;">
            Reset Password
          </a>
        </p>

        <p>If the button doesn't work, copy this link:</p>
        <p style="word-break:break-all;">${resetUrl}</p>

        <hr />
        <p style="font-size:12px;color:#555;">${supportText}</p>
        <p style="font-size:12px;color:#555;">Regards,<br/>Rent-a-Ride Team</p>
      </div>
    `;

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Rent-a-Ride <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    console.log("📧 Resend email sent:", response);
    return true;
  } catch (err) {
    console.error("❌ Resend email error:", err);
    return false;
  }
}

/**
 * Stubbed verify function to keep server.js happy.
 * With Resend (HTTP API), there is no SMTP connection to verify,
 * but we can log once at startup.
 */
export async function verifyTransporter() {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY is not set. Emails will NOT be sent.");
    return false;
  }
  console.log("📬 Resend ready – API key configured.");
  return true;
}
