import express from "express";
import {
	createCoupon,
	validateCoupon,
	getUserCoupons,
	applyCoupon,
	getAllCoupons,
	deleteCoupon,
} from "../controllers/coupon.controller.js";
import { verifyAdmin, verifyAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Create coupon (admin only)
router.post("/create", verifyAdmin, createCoupon);

// Validate coupon
router.post("/validate", verifyAuth, validateCoupon);

// Get user coupons
router.get("/user/:userId", verifyAuth, getUserCoupons);

// Apply coupon (mark as used)
router.post("/apply", verifyAuth, applyCoupon);

// Get all coupons (admin only)
router.get("/", verifyAdmin, getAllCoupons);

// Delete coupon (admin only)
router.delete("/:id", verifyAdmin, deleteCoupon);

export default router;
