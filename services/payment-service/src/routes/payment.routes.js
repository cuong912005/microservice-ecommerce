import express from "express";
import {
	createCheckoutSession,
	checkoutSuccess,
	handleWebhook,
	getUserTransactions,
	getTransaction,
	createRefund,
} from "../controllers/payment.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Protected routes (require authentication)
router.post("/create-checkout-session", protectRoute, createCheckoutSession);
router.post("/checkout-success", protectRoute, checkoutSuccess);
router.post("/refund", protectRoute, createRefund);
router.get("/transactions", protectRoute, getUserTransactions);
router.get("/transactions/:id", protectRoute, getTransaction);

// Webhook route (no auth - verified by Stripe signature)
// Note: This needs raw body, so it's handled separately in index.js
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

export default router;
