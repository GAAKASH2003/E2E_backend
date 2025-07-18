import { Router } from "express";
import {
  signup,
  verifyOTP,
  login,
  forgotPassword,
  providerLogin,
} from "../controllers/authController";

// import { requireSupabaseAuth } from "../middleware/jwtverify";

const router = Router();

router.post("/signup", signup);
router.post("/verify", verifyOTP);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/syncuser", providerLogin);

export default router;
