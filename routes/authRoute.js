import express from 'express';
import {
  signUp,
  signIn,
  google,
  refreshToken,
  forgotPassword,
  resetPassword,
  signUpVendor,
  signUpAdmin,
  firebaseAuth,
} from '../controllers/authController.js';

import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// ------------------ SIGNUP ------------------
router.post('/signup', signUp);
router.post('/signup/vendor', signUpVendor);
router.post('/signup/admin', signUpAdmin);

// ------------------ SIGNIN ------------------
router.post('/signin', signIn);

// ------------------ GOOGLE AUTH ------------------
router.post('/google', google);

// ------------------ FIREBASE AUTH ------------------
router.post('/firebase', firebaseAuth);

// ------------------ REFRESH TOKEN ------------------
router.post('/refresh', refreshToken); 
// simpler URL: /auth/refresh (recommended)

// ------------------ PASSWORD RESET ------------------
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// ------------------ AUTH CHECK (OPTIONAL ENDPOINT) ------------------
// allows client to verify a valid token instantly
router.get('/check', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
