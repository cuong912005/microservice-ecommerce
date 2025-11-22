import express from "express";
import {
	getDashboardAnalytics,
	getUserActivity,
	getSalesReport,
} from "../controllers/analytics.controller.js";
import { verifyAdmin, verifyAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Get dashboard analytics (admin only)
router.get("/", verifyAdmin, getDashboardAnalytics);

// Get user activity
router.get("/user/:userId", verifyAuth, getUserActivity);

// Get sales report (admin only)
router.get("/sales", verifyAdmin, getSalesReport);

export default router;
