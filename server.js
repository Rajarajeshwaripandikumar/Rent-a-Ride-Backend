import dotenv from "dotenv";
dotenv.config();

import "./utils/cloudinaryConfig.js";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

// Import SMTP verifier
import { verifyTransporter } from "./utils/email.js";

// Routes
import userRoute from "./routes/userRoute.js";
import authRoute from "./routes/authRoute.js";
import adminRoute from "./routes/adminRoute.js";
import vendorRoute from "./routes/venderRoute.js";
import vehicleRoute from "./routes/vehicleRoute.js";
import invoiceRoute from "./routes/invoiceRoute.js";
import contactRoute from "./routes/contactRoute.js";
import firebaseAuthRoute from "./routes/firebaseAuthRoute.js";

const app = express();

/* ============================================================
   FIX __dirname for ES modules
============================================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============================================================
   STATIC FILE SERVING (CRITICAL FOR INVOICE IMAGES)
============================================================ */
app.use(
  "/vehicles",
  express.static(path.join(__dirname, "..", "frontend", "public", "vehicles"))
);

app.use(
  "/vehicles",
  express.static(path.join(__dirname, "public", "vehicles"))
);

app.use(express.static(path.join(__dirname, "public")));

console.log("Static folders enabled:");
console.log(" → FRONTEND /vehicles:", path.join(__dirname, "..", "frontend", "public", "vehicles"));
console.log(" → BACKEND  /vehicles:", path.join(__dirname, "public", "vehicles"));
console.log(" → BACKEND  /public:", path.join(__dirname, "public"));

/* ============================================================
   SECURITY
============================================================ */
app.use(helmet());

/* ============================================================
   CORS CONFIGURATION
============================================================ */
const allowedOrigins = [
  "https://rent-a-ride-teju.netlify.app", // Production Frontend
  "http://localhost:5173", // Local Development
];

app.use(
  cors({
    origin: function (origin, callback) {
      console.log("[CORS] Incoming request origin:", origin || "(none)");

      if (!origin) return callback(null, true); // Allow Postman, mobile apps, server-to-server

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("[CORS] Blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "PUT", "POST", "PATCH", "DELETE"],
    credentials: true, // Important for sending cookies and session data
  })
);

/* ============================================================
   BASIC MIDDLEWARE
============================================================ */
app.use(cookieParser());
app.use(express.json());

/* ============================================================
   DEBUG LOGGER
============================================================ */
app.use((req, res, next) => {
  console.log(
    `[incoming] ${req.method} ${req.originalUrl} | origin=${
      req.headers.origin || "(none)"
    } | cookies=${!!req.headers.cookie}`
  );
  next();
});

/* ============================================================
   ROUTES
============================================================ */
app.use("/api/user", userRoute);
app.use("/api/auth", authRoute);
app.use("/api/admin", adminRoute);
app.use("/api/vendor", vendorRoute);
app.use("/api/vehicles", vehicleRoute);
app.use("/api/invoice", invoiceRoute);
app.use("/api/contact", contactRoute);
app.use("/api/auth", firebaseAuthRoute);

/* ============================================================
   GLOBAL ERROR HANDLER
============================================================ */
app.use((err, req, res, next) => {
  console.error("❌ Error middleware:", err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ============================================================
   START DB + SERVER
============================================================ */
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Only verify SMTP in development or when SMTP_DEBUG=true
    if (process.env.NODE_ENV !== "production" || process.env.SMTP_DEBUG === "true") {
      console.log("🔍 Verifying SMTP transporter...");
      await verifyTransporter(); // prints success or error
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Open: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

export default app;
