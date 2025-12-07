// backend/utils/email.js
import nodemailer from "nodemailer";

/**
 * Email / SMTP utility
 *
 * REQUIRED ENV:
 *  - SMTP_HOST
 *  - SMTP_PORT
 *  - SMTP_USER
 *  - SMTP_PASS
 *  - EMAIL_FROM
 *
 * OPTIONAL:
 *  - SMTP_SECURE   ("true" to use port 465, else false/587)
 *  - SMTP_DEBUG    ("true" to enable verbose nodemailer logging)
 *  - NODE_ENV      ("production" to hide most logs)
 */

const isProd = process.env.NODE_ENV === "production";
const smtpDebug = process.env.SMTP_DEBUG === "true";

export function createTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    // Only warn in non-production or when explicitly debugging
    if (!isProd || smtpDebug) {
      console.warn(
        "⚠️ SMTP NOT CONFIGURED: Missing SMTP_HOST / SMTP_USER / SMTP_PASS"
      );
    }
    return null; // Fallback: controller logs link instead
  }

  try {
    const baseConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true", // true only for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // Enable nodemailer internal logging ONLY if SMTP_DEBUG=true
    const transporter = nodemailer.createTransport(
      smtpDebug
        ? {
            ...baseConfig,
            logger: true,
            debug: true,
          }
        : baseConfig
    );

    return transporter;
  } catch (err) {
    console.error("❌ Failed to create SMTP transporter:", err);
    return null;
  }
}

/**
 * Sends a password-reset email using the above transporter.
 *
 * @param {string} to - Recipient email
 * @param {string} resetUrl - URL to be included in the email
 * @param {object} opts - options: { isVendor: boolean }
 */
export async function sendResetEmail(to, resetUrl, opts = {}) {
  const transporter = createTransporter();
  if (!transporter) {
    if (!isProd || smtpDebug) {
      console.warn("⚠️ Cannot send email: transporter not available");
    }
    return false;
  }

  const isVendor = !!opts.isVendor;

  const subject = isVendor ? "Vendor Password Reset" : "Password Reset";
  const greeting = isVendor ? "Hello Vendor," : "Hello,";
  const supportText = isVendor
    ? "If you did not request this reset or need help, contact vendor support."
    : "If you did not request this, please contact our support team.";

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h3>${greeting}</h3>
      <p>You requested a password reset. Click the button below to set a new password.</p>

      <p style="text-align:center; margin: 24px 0;">
        <a href="${resetUrl}" 
           style="display:inline-block; padding:12px 20px; background:#0071DC; 
                  color:#fff; border-radius:6px; text-decoration:none;">
          Reset Password
        </a>
      </p>

      <p>If the button above does not work, copy and paste this link:</p>
      <p style="word-break:break-all;">${resetUrl}</p>

      <hr style="margin:20px 0;" />

      <p style="font-size:12px; color:#555;">${supportText}</p>
      <p style="font-size:12px; color:#555;">Regards,<br>Rent-a-Ride Team</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || "Rent-a-Ride <noreply@yourapp.com>",
      to,
      subject,
      html,
    });

    if (!isProd || smtpDebug) {
      console.log("📩 Email sent:", info.messageId);
    }
    return true;
  } catch (err) {
    console.error("❌ Error sending reset email:", err);
    return false;
  }
}

/**
 * DEBUG helper — verifies SMTP connectivity/auth.
 * You can call this from server startup ONLY when needed.
 */
export async function verifyTransporter() {
  const transporter = createTransporter();
  if (!transporter) {
    if (!isProd || smtpDebug) {
      console.warn("⚠️ verifyTransporter: transporter not available");
    }
    return false;
  }

  try {
    await transporter.verify(); // checks SMTP connection + auth
    if (!isProd || smtpDebug) {
      console.log("📬 SMTP verified and ready to send emails");
    }
    return true;
  } catch (err) {
    console.error("❌ SMTP verify failed:", err.message || err);
    return false;
  }
}
