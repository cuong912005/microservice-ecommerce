import express from "express";
import {
	getUserNotifications,
	markNotificationAsRead,
	markAllAsRead,
	deleteNotification,
} from "../controllers/notification.controller.js";

const router = express.Router();

// Get user notifications
router.get("/user/:userId", getUserNotifications);

// Mark notification as read
router.patch("/:id/read", markNotificationAsRead);

// Mark all notifications as read for user
router.patch("/user/:userId/read-all", markAllAsRead);

// Delete notification
router.delete("/:id", deleteNotification);

export default router;
