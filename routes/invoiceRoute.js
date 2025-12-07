// routes/invoiceRoute.js
import express from "express";
import PDFDocument from "pdfkit";
import mongoose from "mongoose";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mongoose models (must be registered elsewhere)
const Booking = mongoose.model("Booking");
const Vehicle = mongoose.model("Vehicle");

// very small auth placeholder (replace with your real auth if needed)
const authMiddleware = (req, res, next) => {
  // If you use JWT in header, validate here.
  return next();
};

// ---- helpers ----
async function fetchImageBufferHttp(url) {
  try {
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 7000 });
    if (r && r.data) return Buffer.from(r.data);
  } catch (err) {
    // silent fail
    console.warn("[invoice] http fetch failed:", url, err.message || err);
  }
  return null;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Normalize many shapes of image value:
 *  - plain string / filename
 *  - array -> first item
 *  - object -> .url, .secure_url, .public_id etc
 */
function normalizeImageCandidate(vehicle) {
  if (!vehicle) return null;
  let img = vehicle.image ?? vehicle.img ?? vehicle.filename ?? null;
  if (!img) return null;

  if (Array.isArray(img) && img.length) img = img[0];

  if (img && typeof img === "object") {
    if (img.url) return img.url;
    if (img.secure_url) return img.secure_url;
    if (img.public_id) return img.public_id; // best-effort (may need extension)
    // if object has src or path:
    if (img.src) return img.src;
    if (img.path) return img.path;
    return null;
  }

  if (typeof img === "string") return img.trim();
  return null;
}

/**
 * Try to load the vehicle image buffer:
 * - if candidate is full URL -> try HTTP fetch
 * - try backend public/vehicles folder
 * - try frontend public/vehicles folder (if server is configured to serve it, we can still fetch via HTTP)
 * - try static HTTP route
 * - try placeholders
 */
async function tryLoadVehicleImage(req, possibleImageRaw) {
  if (!possibleImageRaw) {
    console.warn("[invoice] no image candidate");
    return null;
  }

  console.log("[invoice] image candidate:", possibleImageRaw);

  // if looks like a remote URL
  if (/^https?:\/\//i.test(possibleImageRaw)) {
    console.log("[invoice] trying remote URL fetch:", possibleImageRaw);
    const remoteBuf = await fetchImageBufferHttp(possibleImageRaw);
    if (remoteBuf) {
      console.log("[invoice] remote image fetched OK");
      return remoteBuf;
    }
  }

  // sanitize filename (remove leading slash)
  let filename = possibleImageRaw.startsWith("/") ? possibleImageRaw.slice(1) : possibleImageRaw;
  filename = filename.split("?")[0]; // drop query

  // Try backend/public/vehicles exact file
  const backendLocal = path.join(__dirname, "..", "public", "vehicles", filename);
  if (await fileExists(backendLocal)) {
    try {
      const b = await fs.readFile(backendLocal);
      console.log("[invoice] loaded local backend file:", backendLocal);
      return b;
    } catch (e) {
      console.warn("[invoice] read backend local file failed:", backendLocal, e.message || e);
    }
  }

  // Try frontend/public/vehicles exact file (if front folder present on disk)
  const frontendLocal = path.join(__dirname, "..", "..", "frontend", "public", "vehicles", filename);
  if (await fileExists(frontendLocal)) {
    try {
      const b = await fs.readFile(frontendLocal);
      console.log("[invoice] loaded local frontend file:", frontendLocal);
      return b;
    } catch (e) {
      console.warn("[invoice] read frontend local file failed:", frontendLocal, e.message || e);
    }
  }

  // If no extension, try common extensions
  if (!path.extname(filename)) {
    const exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    for (const ext of exts) {
      const p1 = path.join(__dirname, "..", "public", "vehicles", filename + ext);
      if (await fileExists(p1)) {
        try {
          const b = await fs.readFile(p1);
          console.log("[invoice] loaded backend file with ext:", p1);
          return b;
        } catch (e) {
          console.warn("[invoice] read backend file with ext failed:", p1, e.message || e);
        }
      }
      const p2 = path.join(__dirname, "..", "..", "frontend", "public", "vehicles", filename + ext);
      if (await fileExists(p2)) {
        try {
          const b = await fs.readFile(p2);
          console.log("[invoice] loaded frontend file with ext:", p2);
          return b;
        } catch (e) {
          console.warn("[invoice] read frontend file with ext failed:", p2, e.message || e);
        }
      }
    }
  }

  // Try HTTP from server static route (backend should serve /vehicles)
  try {
    const imageUrl = `${req.protocol}://${req.get("host")}/vehicles/${encodeURIComponent(filename)}`;
    console.log("[invoice] trying static HTTP fetch:", imageUrl);
    const httpBuf = await fetchImageBufferHttp(imageUrl);
    if (httpBuf) {
      console.log("[invoice] static HTTP fetch OK:", imageUrl);
      return httpBuf;
    }
  } catch (e) {
    console.warn("[invoice] static HTTP fetch error:", e.message || e);
  }

  // Try placeholders from public folder
  const placeholders = ["/placeholder-vehicle.png", "/logo.png", "/favicon.ico"];
  for (const p of placeholders) {
    try {
      const url = `${req.protocol}://${req.get("host")}${p}`;
      const buf = await fetchImageBufferHttp(url);
      if (buf) {
        console.log("[invoice] using placeholder:", p);
        return buf;
      }
    } catch (e) {
      // ignore
    }
  }

  console.warn("[invoice] no image could be loaded for:", possibleImageRaw);
  return null;
}

// ---- Route ----
router.get("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) return res.status(400).json({ error: "Missing bookingId" });

    const booking = await Booking.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Resolve vehicle: prefer booking.vehicleDetails, booking.vehicle, or lookup by id
    let vehicle = null;
    if (booking.vehicleDetails) vehicle = booking.vehicleDetails;
    else if (booking.vehicle) vehicle = booking.vehicle;
    else if (booking.vehicleId) vehicle = await Vehicle.findById(booking.vehicleId).lean();

    // Normalize image candidate and try loading it
    const possibleImage = normalizeImageCandidate(vehicle);
    const vehicleImageBuffer = await tryLoadVehicleImage(req, possibleImage);

    // Try site logo placeholders
    let logoBuffer = null;
    const logoCandidates = ["/logo.png", "/logo192.png", "/favicon.ico"];
    for (const p of logoCandidates) {
      try {
        const url = `${req.protocol}://${req.get("host")}${p}`;
        logoBuffer = await fetchImageBufferHttp(url);
        if (logoBuffer) break;
      } catch (e) {}
    }

    // Prepare PDF response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice_${bookingId}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    // HEADER
    const headerY = 20;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 40, headerY, { fit: [80, 80] });
      } catch (e) {}
    }

    doc.fontSize(20).fillColor("#111").text("Rent a Ride — Invoice", logoBuffer ? 140 : 40, headerY);

    doc.moveDown(2);

    // Booking meta
    const createdAt = new Date(booking.createdAt || Date.now());
    doc.fontSize(10).fillColor("#444");
    doc.text(`Booking ID: ${booking._id}`, { continued: false });
    doc.text(`Date: ${createdAt.toLocaleString()}`, { moveDown: 0.5 });

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#EEE").stroke();
    doc.moveDown(0.6);

    // Two columns: left booking info, right vehicle & image
    const leftX = 50;
    const rightX = 320;
    let y = doc.y;

    // LEFT booking info
    doc.fontSize(11).fillColor("#111").text("Booking Information", leftX, y);
    doc.fontSize(10).fillColor("#333");
    const pickUp = booking.pickUpLocation ?? booking.pickup_location ?? booking.from ?? "-";
    const dropOff = booking.dropOffLocation ?? booking.dropoff_location ?? booking.to ?? "-";
    const pickupDate = booking.pickupDate ?? booking.pickUpDate ?? booking.from ?? null;
    const dropDate = booking.dropOffDate ?? booking.dropoffDate ?? booking.to ?? null;

    doc.text(`Pickup Location: ${pickUp}`, leftX, doc.y + 6);
    doc.text(`Dropoff Location: ${dropOff}`, leftX, doc.y + 2);
    doc.text(
      `Pickup Date/Time: ${pickupDate ? new Date(pickupDate).toLocaleString() : "-"}`,
      leftX,
      doc.y + 2
    );
    doc.text(
      `Dropoff Date/Time: ${dropDate ? new Date(dropDate).toLocaleString() : "-"}`,
      leftX,
      doc.y + 2
    );

    // RIGHT vehicle card and image
    const vehicleTop = y;
    doc.fontSize(11).fillColor("#111").text("Vehicle", rightX, vehicleTop);
    let imgY = doc.y + 8;
    if (vehicleImageBuffer) {
      try {
        doc.image(vehicleImageBuffer, rightX, imgY, { fit: [140, 100], align: "right" });
      } catch (e) {
        console.warn("[invoice] pdf image embed failed:", e.message || e);
      }
    }
    const vehicleTextY = imgY + (vehicleImageBuffer ? 90 : 0) + 6;
    doc.fontSize(10).fillColor("#333");
    doc.text(`Name / Model: ${vehicle?.name ?? vehicle?.model ?? "-"}`, rightX, vehicleTextY);
    doc.text(`Vehicle Number: ${vehicle?.registeration_number ?? vehicle?.regNo ?? "-"}`, rightX, doc.y + 2);
    doc.text(`Company: ${vehicle?.company ?? vehicle?.brand ?? "-"}`, rightX, doc.y + 2);
    doc.text(`Fuel Type: ${vehicle?.fuel_type ?? "-"}`, rightX, doc.y + 2);
    doc.text(`Transmission: ${vehicle?.transmition ?? vehicle?.transmission ?? "-"}`, rightX, doc.y + 2);

    doc.moveDown(2);

    // ---------- Payment summary (robust, consistent) ----------
    const tableTop = Math.max(doc.y + 6, vehicleTextY + 40);
    doc.fontSize(12).fillColor("#111").text("Payment Summary", leftX, tableTop);
    doc.moveDown(0.5);

    // determine base/price and days
    const parsedPickup = pickupDate ? new Date(pickupDate) : null;
    const parsedDrop = dropDate ? new Date(dropDate) : null;
    let days = 1;
    if (parsedPickup && parsedDrop && !isNaN(parsedPickup.getTime()) && !isNaN(parsedDrop.getTime())) {
      const diffMs = Math.max(0, parsedDrop - parsedPickup);
      days = Math.max(1, Math.ceil(diffMs / (1000 * 3600 * 24)));
    }

    // Choose a base price value (try many fields). Prefer explicit base/price, then fallback to totalPrice.
    const rawBase =
      booking.baseAmount ??
      booking.price ??
      booking.base_amount ??
      booking.base ??
      booking.totalPrice ??
      booking.total ??
      booking.total_price ??
      0;

    const base = Number(rawBase) || 0;
    const shipping = Number(booking.shipping ?? booking.shippingFee ?? 0) || 0;
    const coupon = Number(booking.coupon ?? booking.couponValue ?? 0) || 0;

    // If booking.totalPrice exists, use that as truth for total. Otherwise compute.
    const totalFromBooking =
      Number(booking.totalPrice ?? booking.total ?? booking.total_price) || null;

    let computedTotal = base + shipping - coupon;
    if (totalFromBooking !== null && !isNaN(totalFromBooking) && totalFromBooking > 0) {
      // Use booking's total if it exists
      computedTotal = totalFromBooking;
    }

    // try infer per-day price
    let perDay = null;
    if (base && days && base > 0) {
      perDay = base;
    } else if (computedTotal && days) {
      perDay = Math.round((computedTotal / days) * 100) / 100;
    }

    const colLeft = leftX;
    const colRight = doc.page.width - 120;
    const rowGap = 18;
    let rowY = doc.y;

    if (perDay) {
      doc.fontSize(10).fillColor("#555").text(`Rent (${days} day${days > 1 ? "s" : ""})`, colLeft, rowY);
      doc.fontSize(10).fillColor("#111").text(`₹${(perDay * days).toFixed(2)}`, colRight, rowY, { align: "right" });
      rowY += rowGap;
    } else {
      doc.fontSize(10).fillColor("#555").text("Base Amount", colLeft, rowY);
      doc.fontSize(10).fillColor("#111").text(`₹${base.toFixed(2)}`, colRight, rowY, { align: "right" });
      rowY += rowGap;
    }

    // Shipping
    doc.fontSize(10).fillColor("#555").text("Shipping", colLeft, rowY);
    doc.fontSize(10).fillColor("#111").text(`₹${shipping.toFixed(2)}`, colRight, rowY, { align: "right" });
    rowY += rowGap;

    // Coupon (if any)
    if (coupon) {
      doc.fontSize(10).fillColor("#555").text("Coupon", colLeft, rowY);
      doc.fontSize(10).fillColor("#111").text(`-₹${coupon.toFixed(2)}`, colRight, rowY, { align: "right" });
      rowY += rowGap;
    }

    // divider
    doc.moveTo(colLeft, rowY).lineTo(doc.page.width - 40, rowY).lineWidth(0.8).strokeColor("#DDD").stroke();
    rowY += 8;

    doc.fontSize(12).fillColor("#111").text("Total:", colLeft, rowY);
    doc.fontSize(14).fillColor("#000").text(`₹${computedTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, colRight, rowY, { align: "right" });

    doc.moveDown(3);

    // Footer notes
    doc.fontSize(9).fillColor("#666").text("Thank you for booking with Rent a Ride.", leftX, doc.y);
    doc.text("Contact support: support@rentaride.example", leftX, doc.y + 14);

    // finalize
    doc.end();
  } catch (err) {
    console.error("Invoice generation error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to generate invoice" });
    }
    try {
      res.end();
    } catch (e) {}
  }
});

export default router;
