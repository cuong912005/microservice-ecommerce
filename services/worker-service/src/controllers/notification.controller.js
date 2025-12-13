import Notification from "../models/notification.model.js";

// Get user notifications 
export const getUserNotifications = async (req, res) => {
	try {
		const { userId } = req.params;
		const { page = 1, limit = 20, unreadOnly = false } = req.query;

		const skip = (page - 1) * limit;

		// Build query
		const query = { userId };
		if (unreadOnly === "true") {
			query.isRead = false;
		}

		const notifications = await Notification.find(query)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		const total = await Notification.countDocuments(query);
		const unreadCount = await Notification.countDocuments({
			userId,
			isRead: false,
		});

		res.json({
			notifications,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
			unreadCount,
		});
	} catch (error) {
		console.error("Error fetching notifications:", error);
		res.status(500).json({
			message: "Error fetching notifications",
			error: error.message,
		});
	}
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
	try {
		const { id } = req.params;

		const notification = await Notification.findById(id);

		if (!notification) {
			return res.status(404).json({ message: "Notification not found" });
		}

		if (!notification.isRead) {
			notification.isRead = true;
			notification.readAt = new Date();
			await notification.save();
		}

		res.json({
			success: true,
			message: "Notification marked as read",
			notification,
		});
	} catch (error) {
		console.error("Error marking notification as read:", error);
		res.status(500).json({
			message: "Error updating notification",
			error: error.message,
		});
	}
};

// Mark all notifications as read for a user
export const markAllAsRead = async (req, res) => {
	try {
		const { userId } = req.params;

		const result = await Notification.updateMany(
			{ userId, isRead: false },
			{ isRead: true, readAt: new Date() }
		);

		res.json({
			success: true,
			message: "All notifications marked as read",
			updatedCount: result.modifiedCount,
		});
	} catch (error) {
		console.error("Error marking all as read:", error);
		res.status(500).json({
			message: "Error updating notifications",
			error: error.message,
		});
	}
};

// Delete notification
export const deleteNotification = async (req, res) => {
	try {
		const { id } = req.params;

		const notification = await Notification.findByIdAndDelete(id);

		if (!notification) {
			return res.status(404).json({ message: "Notification not found" });
		}

		res.json({
			success: true,
			message: "Notification deleted",
		});
	} catch (error) {
		console.error("Error deleting notification:", error);
		res.status(500).json({
			message: "Error deleting notification",
			error: error.message,
		});
	}
};
