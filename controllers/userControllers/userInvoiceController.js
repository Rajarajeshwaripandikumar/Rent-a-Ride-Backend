// backend/controllers/userControllers/userInvoiceController.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import Booking from "../../models/BookingModel.js";

/* ───────────── Helpers ───────────── */

const safeDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const formatMoney = (v) => {
  const num = Number(v || 0);
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

// Map vehicle.image -> real file path (search in few common folders)
const resolveVehicleImagePath = (vehicle) => {
  const fallback = path.join(
    process.cwd(),
    "assets",
    "invoice-car-placeholder.png"
  );
  const hasFallback = fs.existsSync(fallback);

  if (!vehicle) return hasFallback ? fallback : null;

  let raw =
    (Array.isArray(vehicle.image) && vehicle.image[0]) ||
    vehicle.image ||
    vehicle.img ||
    vehicle.photo ||
    null;

  if (!raw || typeof raw !== "string") {
    return hasFallback ? fallback : null;
  }

  let fileName = raw.trim();

  // if URL → last segment only
  if (fileName.startsWith("http://") || fileName.startsWith("https://")) {
    fileName = fileName.split("/").pop() || fileName;
  }

  // strip leading /vehicles/
  fileName = fileName.replace(/^\/?vehicles\//, "");

  // add extension if missing
  if (!fileName.includes(".")) fileName = `${fileName}.jpg`;

  const candidates = [
    // backend/public/vehicles/name
    path.join(process.cwd(), "public", "vehicles", fileName),
    // ../frontend/public/vehicles/name
    path.join(process.cwd(), "..", "frontend", "public", "vehicles", fileName),
    // backend/assets/vehicles/name
    path.join(process.cwd(), "assets", "vehicles", fileName),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return hasFallback ? fallback : null;
};

/* ───────────── Controller: Simple Professional Invoice ───────────── */

export const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("vehicleId")
      .populate("userId")
      .lean();

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    const filename = `Invoice_${booking._id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    const user = booking.userId || {};
    const vehicle = booking.vehicleId || {};
    const imgPath = resolveVehicleImagePath(vehicle);

    const pickupDate = safeDate(booking.pickupDate);
    const dropoffDate = safeDate(booking.dropOffDate);
    const createdAt = safeDate(booking.createdAt) || new Date();

    // Simple palette
    const primary = "#1F2937"; // gray-800
    const muted = "#6B7280"; // gray-500
    const blue = "#0071DC"; // Walmart blue

    /* ───────────── HEADER ───────────── */
    doc
      .fontSize(22)
      .fillColor(blue)
      .text("Rent A Ride - Invoice", { align: "left" });

    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Invoice ID: ${booking._id}`);

    doc
      .fontSize(10)
      .fillColor(muted)
      .text(
        `Generated on: ${createdAt.toLocaleString("en-IN")}`,
        { lineGap: 2 }
      );

    doc.moveDown(1);

    /* ───────────── BOOKING INFO ───────────── */
    doc
      .fontSize(13)
      .fillColor(primary)
      .text("Booking Details", { underline: true });

    doc.moveDown(0.4);
    doc.fontSize(11).fillColor(muted);
    doc.text(`Status: ${booking.status || "Booked"}`);
    doc.text(`Pickup Location: ${booking.pickUpLocation || "-"}`);
    doc.text(`Dropoff Location: ${booking.dropOffLocation || "-"}`);
    doc.text(
      `Pickup Date & Time: ${
        pickupDate ? pickupDate.toLocaleString("en-IN") : "-"
      }`
    );
    doc.text(
      `Dropoff Date & Time: ${
        dropoffDate ? dropoffDate.toLocaleString("en-IN") : "-"
      }`
    );

    doc.moveDown(1);

    /* ───────────── USER INFO ───────────── */
    doc
      .fontSize(13)
      .fillColor(primary)
      .text("Customer Details", { underline: true });

    doc.moveDown(0.4);
    doc.fontSize(11).fillColor(muted);
    doc.text(`Name: ${user.username || user.name || "-"}`);
    doc.text(`Email: ${user.email || "-"}`);

    doc.moveDown(1);

    /* ───────────── VEHICLE INFO ───────────── */
    doc
      .fontSize(13)
      .fillColor(primary)
      .text("Vehicle Details", { underline: true });

    doc.moveDown(0.6);

    // Car image - simple + auto-fit
    if (imgPath) {
      try {
        doc.image(imgPath, {
          fit: [350, 180], // keeps aspect ratio, no clipping
          align: "left",
        });
        doc.moveDown(1);
      } catch (err) {
        console.warn("[downloadInvoice] image render error:", err.message);
      }
    }

    doc.fontSize(11).fillColor(muted);
    doc.text(`Model: ${vehicle.model || vehicle.name || "-"}`);
    doc.text(`Company: ${vehicle.company || "-"}`);
    doc.text(
      `Registration: ${
        vehicle.registeration_number ||
        vehicle.registration_number ||
        vehicle.reg_number ||
        "-"
      }`
    );
    doc.text(`Fuel Type: ${vehicle.fuel_type || vehicle.fuelType || "-"}`);
    doc.text(
      `Transmission: ${
        vehicle.transmition ||
        vehicle.transmission ||
        vehicle.transmission_type ||
        "-"
      }`
    );

    doc.moveDown(1.4);

    /* ───────────── PAYMENT SUMMARY ───────────── */
    const total = booking.totalPrice || 0;

    doc
      .fontSize(13)
      .fillColor(primary)
      .text("Payment Summary", { underline: true });

    doc.moveDown(0.6);

    doc.fontSize(11).fillColor(muted);
    doc.text(`Base Rent: ₹${formatMoney(total)}`);
    doc.text(`Taxes & Fees: ₹0`); // adjust if you add tax later
    doc.moveDown(0.2);

    doc
      .fontSize(12)
      .fillColor(primary)
      .text(`Total Amount Paid: ₹${formatMoney(total)}`, {
        align: "left",
      });

    doc.moveDown(2);

    /* ───────────── FOOTER ───────────── */
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(
        "Thank you for choosing Rent A Ride. For any queries, contact support@rentaride.com.",
        {
          align: "center",
          width: doc.page.width - 100,
        }
      );

    doc.end();
  } catch (err) {
    console.error("downloadInvoice error:", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, message: "Failed to generate invoice" });
    }
  }
};
