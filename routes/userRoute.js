// src/routes/userRoutes.js
import express from "express";

import { verifyToken } from "../middleware/verifyToken.js";
import { verifyUser } from "../utils/verifyUser.js";

import {
  updateUser,
  deleteUser,
  signOut,
} from "../controllers/userControllers/userController.js";

import {
  listAllVehicles,
  showVehicleDetails,
} from "../controllers/userControllers/userAllVehiclesController.js";

import { editUserProfile } from "../controllers/userControllers/userProfileController.js";

import {
  BookCar,
  razorpayOrder,
  getVehiclesWithoutBooking,
  filterVehicles,
  showAllVariants,
  findBookingsOfUser,
  sendBookingDetailsEamil, // controller name has typo but it's ok
  latestbookings,
} from "../controllers/userControllers/userBookingController.js";

import { showSingleOfSameModel } from "../controllers/userControllers/showSingleOfSameModel.js";

import { multerSingleUpload } from "../utils/multer.js";

// 🔹 locations LOV
import { getLocationsLov } from "../controllers/userControllers/locationLovController.js";

// 🔹 NEW: invoice download controller
import { downloadInvoice } from "../controllers/userControllers/userInvoiceController.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*                      PROTECTED ROUTES (USER LOGGED IN)                     */
/* -------------------------------------------------------------------------- */

router.post("/update/:id", verifyToken, verifyUser, updateUser);
router.delete("/delete/:id", verifyToken, verifyUser, deleteUser);
router.get("/signout", verifyToken, verifyUser, signOut);

router.post(
  "/editUserProfile/:id",
  verifyToken,
  verifyUser,
  multerSingleUpload,
  editUserProfile
);

// booking + payments
router.post("/bookCar", verifyToken, verifyUser, BookCar);
router.post("/findBookingsOfUser", verifyToken, verifyUser, findBookingsOfUser);
router.post("/latestbookings", verifyToken, verifyUser, latestbookings);

/* this path matches frontend: /api/user/sendBookingDetailsEmail */
router.post(
  "/sendBookingDetailsEmail",
  verifyToken,
  verifyUser,
  sendBookingDetailsEamil
);

/* Razorpay order endpoint – matches frontend: /api/user/razorpay */
router.post("/razorpay", verifyToken, verifyUser, razorpayOrder);

/* ✅ NEW: invoice download – frontend will call /api/user/invoice/:id */
router.get("/invoice/:id", verifyToken, verifyUser, downloadInvoice);

/* -------------------------------------------------------------------------- */
/*                           PUBLIC (NO LOGIN NEEDED)                         */
/* -------------------------------------------------------------------------- */

router.get("/listAllVehicles", listAllVehicles);
router.post("/showVehicleDetails", showVehicleDetails);

router.post("/filterVehicles", filterVehicles);
router.post(
  "/getVehiclesWithoutBooking",
  getVehiclesWithoutBooking,
  showAllVariants
);

router.post("/showSingleofSameModel", showSingleOfSameModel);

// locations LOV
router.get("/getLocationsLov", getLocationsLov);

export default router;
