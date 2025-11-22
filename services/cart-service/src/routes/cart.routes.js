import express from "express";
import {
	getCart,
	addToCart,
	updateQuantity,
	removeFromCart,
	clearCart,
	validateCart,
} from "../controllers/cart.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// All cart routes require authentication
router.get("/", protectRoute, getCart);
router.post("/", protectRoute, addToCart);
router.put("/:productId", protectRoute, updateQuantity);
router.delete("/:productId", protectRoute, removeFromCart);
router.delete("/", protectRoute, clearCart);

// Validate cart (Story 4.2)
router.post("/validate", protectRoute, validateCart);

export default router;
