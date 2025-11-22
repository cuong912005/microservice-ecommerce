import express from "express";
import {
	signup,
	login,
	logout,
	refreshToken,
	getProfile,
	oauthSuccess,
	oauthFailure,
	validateToken,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import passport from "../lib/passport.js";

const router = express.Router();

// Local authentication
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.get("/profile", protectRoute, getProfile);

// Token validation for other services
router.get("/validate-token", validateToken);

// Google OAuth routes
router.get(
	"/google",
	passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
	"/google/callback",
	passport.authenticate("google", {
		failureRedirect: "/api/auth/oauth/failure",
		session: false,
	}),
	oauthSuccess
);

// OAuth handlers
router.get("/oauth/success", oauthSuccess);
router.get("/oauth/failure", oauthFailure);

export default router;
