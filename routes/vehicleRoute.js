// backend/routes/vehicleRoute.js
import express from "express";
import * as controller from "../controllers/vehicleController.js";

const router = express.Router();

const safeRegister = (method, path, fn, name) => {
  if (typeof fn === "function") {
    router[method](path, fn);
    console.log(`[route] registered ${method.toUpperCase()} ${path} -> ${name}`);
  } else {
    console.warn(`[route] SKIPPED ${method.toUpperCase()} ${path} -> ${name} (not exported)`);
  }
};

// Homepage search (controller may export searchCar or searchVehicles)
safeRegister("post", "/search", controller.searchCar ?? controller.searchVehicles, "searchCar/searchVehicles");

// List all vehicles (GET /api/vehicles/)
safeRegister("get", "/", controller.listAllVehicles, "listAllVehicles");

// Vehicle detail
safeRegister("post", "/details", controller.showVehicleDetails, "showVehicleDetails");

// Get vehicles available for date & location
safeRegister("post", "/getVehiclesWithoutBooking", controller.getVehiclesWithoutBooking, "getVehiclesWithoutBooking");

// Get all variants of a model after availability filter
safeRegister("post", "/showAllVariants", controller.showAllVariants, "showAllVariants");

// Return one representative vehicle per model
safeRegister("post", "/showOneofkind", controller.showOneofkind, "showOneofkind");

// Filtering endpoint
safeRegister("post", "/filterVehicles", controller.filterVehicles, "filterVehicles");

// Booking endpoints
safeRegister("post", "/book", controller.BookCar ?? controller.bookCar, "BookCar/bookCar");

// Razorpay order
safeRegister("post", "/razorpay/order", controller.razorpayOrder, "razorpayOrder");

// Email booking details
safeRegister("post", "/email/booking", controller.sendBookingDetailsEamil ?? controller.sendBookingDetailsEmail, "sendBookingDetailsEamil/sendBookingDetailsEmail");

export default router;
