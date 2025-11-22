import express from "express";
import {
	getAllProducts,
	getProductById,
	createProduct,
	updateProduct,
	deleteProduct,
	getFeaturedProducts,
	toggleFeaturedProduct,
	getProductsByCategory,
	getRecommendedProducts,
} from "../controllers/product.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/", getAllProducts); // Supports ?search=keyword&category=name query params
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.get("/category/:category", getProductsByCategory);
router.get("/:id", getProductById);

// Admin routes
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, updateProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.patch("/:id/toggle-featured", protectRoute, adminRoute, toggleFeaturedProduct);

export default router;
