import mongoose from "mongoose";
import { logger } from "./logger.js";

// Message Schema
const messageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  traceId: { type: String, required: true, index: true },
  channel: { type: String, required: true, enum: ["email", "sms", "whatsapp"] },
  recipient: { type: String, required: true },
  subject: String,
  body: { type: String, required: true },
  metadata: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    required: true,
    enum: ["queued", "processing", "delivered", "failed"],
    default: "queued",
  },
  deliveredAt: Date,
  failedAt: Date,
  errorMessage: String,
  retryCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Email Delivery Handler
export async function handleEmailDelivery(message) {
  const { messageId, traceId, recipient, subject, body, metadata } = message;

  try {
    logger.info("Delivering email", {
      messageId,
      traceId,
      recipient,
      subject,
    });

    // Simulate email delivery (replace with actual email service)
    await simulateDelivery("email", 500);

    // Store in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "email",
        recipient,
        subject,
        body,
        metadata,
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info("Email delivered successfully", {
      messageId,
      traceId,
      recipient,
    });

    return {
      success: true,
      messageId,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    // Store failure in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "email",
        recipient,
        subject,
        body,
        metadata,
        status: "failed",
        failedAt: new Date(),
        errorMessage: error.message,
        retryCount: message.retryCount || 0,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.error("Email delivery failed", {
      messageId,
      traceId,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// SMS Delivery Handler
export async function handleSMSDelivery(message) {
  const { messageId, traceId, recipient, body, metadata } = message;

  try {
    logger.info("Delivering SMS", {
      messageId,
      traceId,
      recipient,
    });

    // Simulate SMS delivery (replace with actual SMS service like Twilio)
    await simulateDelivery("sms", 300);

    // Store in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "sms",
        recipient,
        body,
        metadata,
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info("SMS delivered successfully", {
      messageId,
      traceId,
      recipient,
    });

    return {
      success: true,
      messageId,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    // Store failure in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "sms",
        recipient,
        body,
        metadata,
        status: "failed",
        failedAt: new Date(),
        errorMessage: error.message,
        retryCount: message.retryCount || 0,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.error("SMS delivery failed", {
      messageId,
      traceId,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// WhatsApp Delivery Handler
export async function handleWhatsAppDelivery(message) {
  const { messageId, traceId, recipient, body, metadata } = message;

  try {
    logger.info("Delivering WhatsApp message", {
      messageId,
      traceId,
      recipient,
    });

    // Simulate WhatsApp delivery (replace with actual WhatsApp Business API)
    await simulateDelivery("whatsapp", 400);

    // Store in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "whatsapp",
        recipient,
        body,
        metadata,
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info("WhatsApp message delivered successfully", {
      messageId,
      traceId,
      recipient,
    });

    return {
      success: true,
      messageId,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    // Store failure in database
    await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        traceId,
        channel: "whatsapp",
        recipient,
        body,
        metadata,
        status: "failed",
        failedAt: new Date(),
        errorMessage: error.message,
        retryCount: message.retryCount || 0,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.error("WhatsApp delivery failed", {
      messageId,
      traceId,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// Simulate delivery with random failures for testing
async function simulateDelivery(channel, delay) {
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Simulate 5% failure rate for testing retry logic
  const failureRate = 0.05;
  if (Math.random() < failureRate) {
    throw new Error(`Simulated ${channel} delivery failure`);
  }

  logger.info(`${channel} delivery simulated successfully`);
}
