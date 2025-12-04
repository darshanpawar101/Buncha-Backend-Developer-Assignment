import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import { initializeConsumers } from "./consumer.js";
import { logger } from "./logger.js";

dotenv.config();

const MONGODB_URL =
  process.env.MONGODB_URL || "mongodb://localhost:27017/communication";
const PORT = process.env.PORT || 4001;

async function startService() {
  try {
    // Initialize Express app
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URL);
    logger.info("Connected to MongoDB", { url: MONGODB_URL });

    // Initialize RabbitMQ consumers
    await initializeConsumers();
    logger.info("RabbitMQ consumers initialized");

    // Health check endpoint
    app.get("/health", async (req, res) => {
      const dbStatus =
        mongoose.connection.readyState === 1 ? "connected" : "disconnected";
      res.json({
        status: "healthy",
        service: "delivery-service",
        database: dbStatus,
        timestamp: new Date().toISOString(),
      });
    });

    // Get message status by ID
    app.get("/messages/:messageId", async (req, res) => {
      try {
        const Message = mongoose.model("Message");
        const message = await Message.findOne({
          messageId: req.params.messageId,
        });

        if (!message) {
          return res.status(404).json({ error: "Message not found" });
        }

        res.json(message);
      } catch (error) {
        logger.error("Error fetching message", { error: error.message });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get all messages with pagination
    app.get("/messages", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const Message = mongoose.model("Message");
        const messages = await Message.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);

        const total = await Message.countDocuments();

        res.json({
          messages,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error("Error fetching messages", { error: error.message });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 Delivery Service ready at http://localhost:${PORT}`);
      logger.info(
        `📊 Health check available at http://localhost:${PORT}/health`
      );
    });
  } catch (error) {
    logger.error("Failed to start service", { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

startService();
