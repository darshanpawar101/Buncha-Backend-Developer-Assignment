import amqp from "amqplib";
import { Kafka } from "kafkajs";
import {
  handleEmailDelivery,
  handleSMSDelivery,
  handleWhatsAppDelivery,
} from "./deliveryHandlers.js";
import { logger } from "./logger.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";

let kafkaProducer;

const QUEUES = {
  email: "email_queue",
  sms: "sms_queue",
  whatsapp: "whatsapp_queue",
  dlq: "dead_letter_queue",
};

const HANDLERS = {
  email: handleEmailDelivery,
  sms: handleSMSDelivery,
  whatsapp: handleWhatsAppDelivery,
};

export async function initializeConsumers() {
  try {
    // Initialize Kafka producer
    const kafka = new Kafka({
      clientId: "delivery-service",
      brokers: [KAFKA_BROKER],
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    kafkaProducer = kafka.producer();
    await kafkaProducer.connect();
    logger.info("Kafka producer connected");

    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Set prefetch to process one message at a time
    await channel.prefetch(1);

    // Start consumers for each queue
    for (const [channelType, queueName] of Object.entries(QUEUES)) {
      if (channelType === "dlq") continue; // Skip DLQ for now

      await channel.consume(
        queueName,
        async (msg) => {
          if (msg) {
            await processMessage(channel, msg, channelType);
          }
        },
        { noAck: false }
      );

      logger.info(`Started consumer for ${queueName}`);
    }

    logger.info("All consumers initialized");
  } catch (error) {
    logger.error("Failed to initialize consumers", { error: error.message });
    throw error;
  }
}

async function processMessage(channel, msg, channelType) {
  const startTime = Date.now();
  let message;

  try {
    message = JSON.parse(msg.content.toString());
    const { messageId, traceId, retryCount = 0, maxRetries = 3 } = message;
    const subtraceId = `subtrace_${Date.now()}`;

    logger.info("Processing message", {
      messageId,
      traceId,
      subtraceId,
      channelType,
      retryCount,
    });

    // Log start of processing
    await sendLog({
      service: "delivery",
      level: "info",
      message: "Started message delivery",
      traceId,
      subtraceId,
      messageId,
      channel: channelType,
      retryCount,
      timestamp: new Date().toISOString(),
    });

    // Get appropriate handler
    const handler = HANDLERS[channelType];
    if (!handler) {
      throw new Error(`No handler found for channel: ${channelType}`);
    }

    // Attempt delivery with retry logic
    const result = await deliverWithRetry(
      handler,
      message,
      retryCount,
      maxRetries
    );

    if (result.success) {
      // Acknowledge message
      channel.ack(msg);

      const duration = Date.now() - startTime;

      // Log success
      await sendLog({
        service: "delivery",
        level: "info",
        message: "Message delivered successfully",
        traceId,
        subtraceId,
        messageId,
        channel: channelType,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      logger.info("Message delivered successfully", {
        messageId,
        traceId,
        subtraceId,
        channelType,
        duration: `${duration}ms`,
      });
    } else {
      throw new Error(result.error || "Delivery failed");
    }
  } catch (error) {
    await handleDeliveryError(channel, msg, message, channelType, error);
  }
}

async function deliverWithRetry(handler, message, retryCount, maxRetries) {
  const delays = [1000, 2000, 4000]; // Exponential backoff

  try {
    const result = await handler(message);
    return result;
  } catch (error) {
    if (retryCount < maxRetries) {
      const delay = delays[retryCount] || delays[delays.length - 1];

      logger.warn("Delivery failed, retrying...", {
        messageId: message.messageId,
        retryCount,
        delay: `${delay}ms`,
        error: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increment retry count
      message.retryCount = retryCount + 1;

      // Retry
      return deliverWithRetry(handler, message, retryCount + 1, maxRetries);
    }

    throw error;
  }
}

async function handleDeliveryError(channel, msg, message, channelType, error) {
  const { messageId, traceId, retryCount = 0, maxRetries = 3 } = message || {};

  logger.error("Delivery error", {
    messageId,
    traceId,
    channelType,
    retryCount,
    error: error.message,
  });

  // Log error
  await sendLog({
    service: "delivery",
    level: "error",
    message: "Message delivery failed",
    traceId,
    messageId,
    channel: channelType,
    retryCount,
    error: error.message,
    timestamp: new Date().toISOString(),
  });

  if (retryCount >= maxRetries) {
    // Move to dead letter queue
    logger.error("Max retries exceeded, moving to DLQ", {
      messageId,
      traceId,
      channelType,
    });

    await sendLog({
      service: "delivery",
      level: "error",
      message: "Max retries exceeded, moved to DLQ",
      traceId,
      messageId,
      channel: channelType,
      timestamp: new Date().toISOString(),
    });

    // Reject and don't requeue (goes to DLQ)
    channel.nack(msg, false, false);
  } else {
    // Requeue for retry
    channel.nack(msg, false, true);
  }
}

async function sendLog(logData) {
  try {
    await kafkaProducer.send({
      topic: "communication-logs",
      messages: [
        {
          key: logData.traceId,
          value: JSON.stringify(logData),
          timestamp: Date.now().toString(),
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to send log to Kafka", { error: error.message });
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Closing Kafka producer...");
  if (kafkaProducer) await kafkaProducer.disconnect();
  process.exit(0);
});
