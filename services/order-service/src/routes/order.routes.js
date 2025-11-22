import express from "express";
import {
	createOrder,
	getOrderById,
	getUserOrders,
	updateOrderStatus,
	getAllOrders,
	cancelOrder,
} from "../controllers/order.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// User routes (protected)
router.post("/", protectRoute, createOrder);
router.get("/:id", protectRoute, getOrderById);
router.get("/user/:userId", protectRoute, getUserOrders);
router.post("/:id/cancel", protectRoute, cancelOrder);

// Admin routes (protected + admin)
router.get("/", protectRoute, adminRoute, getAllOrders);
router.patch("/:id/status", protectRoute, adminRoute, updateOrderStatus);

export default router;
