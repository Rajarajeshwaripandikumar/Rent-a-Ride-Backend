import express from "express";
import { signIn } from "../controllers/authController.js";
import { vendorGoogle, vendorSignout, vendorSignup } from "../controllers/vendorControllers/vendorController.js";
import { showVendorVehicles, vendorAddVehicle, vendorDeleteVehicles, vendorEditVehicles } from "../controllers/vendorControllers/vendorCrudController.js";
import { vendorBookings } from "../controllers/vendorControllers/vendorBookingsController.js";
import { vendorStats } from "../controllers/vendorControllers/vendorStatsController.js";
import { verifyVendor } from "../utils/verifyVendor.js";
import { multerMultipleUploads } from "../utils/multer.js";

const router = express.Router();

// Public Auth Routes
router.post("/vendorsignup", vendorSignup);
router.post("/vendorsignin", signIn);
router.post("/vendorgoogle", vendorGoogle);

// Protected Vendor Routes
router.post("/vendorsignout", verifyVendor, vendorSignout);  // Using POST for signout

router.post("/vendorAddVehicle", verifyVendor, multerMultipleUploads, vendorAddVehicle);
router.post("/showVendorVehicles", verifyVendor, showVendorVehicles);  // Fixed typo in route
router.put("/vendorEditVehicles/:id", verifyVendor, vendorEditVehicles);
router.delete("/vendorDeleteVehicles/:id", verifyVendor, vendorDeleteVehicles);

// Vendor Bookings (POST)
router.post("/vendorBookings", verifyVendor, vendorBookings);

// Vendor Stats
router.get("/stats", verifyVendor, vendorStats);

export default router;
