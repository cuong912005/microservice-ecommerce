import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import { connectKafkaConsumers, disconnectKafka } from "./lib/kafka.js";
import { retryFailedEmails } from "./workers/emailWorker.js";
import notificationRoutes from "./routes/notification.routes.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

// CORS configuration
app.use(cors({
	origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5000"],
	credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		service: "worker-service",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Routes
app.use("/notifications", notificationRoutes);

// Root endpoint
app.get("/", (req, res) => {
	res.json({
		service: "Worker Service",
		version: "1.0.0",
		status: "running",
		description: "Background task processor for emails and notifications",
	});
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error("Error:", err);
	res.status(500).json({
		message: "Internal server error",
		error: process.env.NODE_ENV === "development" ? err.message : undefined,
	});
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		message: "Route not found",
	});
});

// Start server
const startServer = async () => {
	try {
		// Connect to MongoDB
		await connectDB();

		// Connect to Kafka and start consuming
		await connectKafkaConsumers();

		// Start retry worker (runs every 5 minutes)
		setInterval(() => {
			console.log("Running retry worker for failed emails...");
			retryFailedEmails();
		}, 5 * 60 * 1000); // 5 minutes

		// Start Express server
		app.listen(PORT, () => {
			console.log(`Worker Service running on port ${PORT}`);
			console.log(`Environment: ${process.env.NODE_ENV}`);
			console.log("Listening for Kafka tasks on: email-tasks, notification-tasks");
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
};

// Graceful shutdown
const gracefulShutdown = async () => {
	console.log("\nShutting down gracefully...");
	
	try {
		await disconnectKafka();
		process.exit(0);
	} catch (error) {
		console.error("Error during shutdown:", error);
		process.exit(1);
	}
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Start the server
startServer();
