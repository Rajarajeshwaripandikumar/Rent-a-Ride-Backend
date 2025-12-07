// routes/contactRoute.js
import express from "express";
import nodemailer from "nodemailer";
import Contact from "../models/Contact.js";

const router = express.Router();

/* ----------------------------------------------------
   ENVIRONMENT DEBUG (SAFE — DOES NOT PRINT SECRETS)
---------------------------------------------------- */
console.log("📌 ENV CHECK (contactRoute.js):", {
  hasGmailUser: !!process.env.GMAIL_USER,
  hasGmailPass: !!process.env.GMAIL_PASS,
  mailFromExists: !!process.env.MAIL_FROM,
  appRunningFrom: process.cwd(),
});

/* ----------------------------------------------------
   VALIDATION FUNCTION
---------------------------------------------------- */
function validate(payload) {
  const { name, email, phone, message } = payload || {};
  if (!name || name.trim().length < 2) return "Name required (min 2 chars)";
  if (!email || !/\S+@\S+\.\S+/.test(email)) return "Valid email required";
  if (!phone || !/^\d{8,}$/.test(String(phone)))
    return "Phone required (min 8 digits)";
  if (!message || message.trim().length < 5)
    return "Message too short (min 5 chars)";
  return null;
}

/* ----------------------------------------------------
   NODEMAILER GMAIL TRANSPORTER (MOST STABLE SETTINGS)
---------------------------------------------------- */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS upgrade (STARTTLS)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  logger: true,
  debug: true,
});

/* ----------------------------------------------------
   VERIFY SMTP CONNECTION AT SERVER STARTUP
---------------------------------------------------- */
transporter.verify((err, success) => {
  if (err) {
    console.error("❌ Nodemailer verify error:", err.message || err);
  } else {
    console.log("✅ Nodemailer Gmail SMTP ready to send messages");
  }
});

/* ----------------------------------------------------
   POST /api/contact/sendMessage
---------------------------------------------------- */
router.post("/sendMessage", async (req, res, next) => {
  try {
    const payload = req.body;

    // Validate incoming request
    const validationError = validate(payload);
    if (validationError)
      return res.status(400).json({ ok: false, error: validationError });

    const { name, email, phone, message, createdAt } = payload;

    /* ------------------------------------------
       EMAIL CONTENT
    ------------------------------------------ */
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, // You receive the contact form emails
      subject: `New Contact Message from ${name}`,
      text: `Name: ${name}
Email: ${email}
Phone: ${phone}
When: ${createdAt || new Date().toISOString()}

Message:
${message}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>When:</strong> ${
          createdAt || new Date().toISOString()
        }</p>
        <hr />
        <p>${message.replace(/\n/g, "<br/>")}</p>
      `,
    };

    /* ------------------------------------------
       SEND EMAIL
    ------------------------------------------ */
    console.log("📤 Sending email...");
    await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully");

    /* ------------------------------------------
       SAVE IN DATABASE
    ------------------------------------------ */
    try {
      await Contact.create({
        name,
        email,
        phone,
        message,
        createdAt: createdAt ? new Date(createdAt) : undefined,
      });
      console.log("📁 Contact message saved to MongoDB");
    } catch (dbErr) {
      console.error("⚠️ Failed to save contact message:", dbErr);
      // Do not fail — email already sent
    }

    return res.json({ ok: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("❌ sendMessage Route Error:", err);
    next(err);
  }
});

export default router;
