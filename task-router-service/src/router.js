import amqp from "amqplib";
import { createClient } from "redis";
import { Kafka } from "kafkajs";
import { createHash } from "crypto";
import { logger } from "./logger.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";

let rabbitConnection;
let rabbitChannel;
let redisClient;
let kafkaProducer;

// Queue names
const QUEUES = {
  email: "email_queue",
  sms: "sms_queue",
  whatsapp: "whatsapp_queue",
  dlq: "dead_letter_queue",
};

export async function initializeConnections() {
  try {
    // Initialize RabbitMQ
    await initRabbitMQ();

    // Initialize Redis
    await initRedis();

    // Initialize Kafka
    await initKafka();

    logger.info("All connections initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize connections", { error: error.message });
    throw error;
  }
}

async function initRabbitMQ() {
  rabbitConnection = await amqp.connect(RABBITMQ_URL);
  rabbitChannel = await rabbitConnection.createChannel();

  // Create queues
  for (const queue of Object.values(QUEUES)) {
    await rabbitChannel.assertQueue(queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUES.dlq,
      },
    });
  }

  logger.info("RabbitMQ initialized", { queues: Object.keys(QUEUES) });
}

async function initRedis() {
  redisClient = createClient({ url: REDIS_URL });

  redisClient.on("error", (err) => {
    logger.error("Redis error", { error: err.message });
  });

  await redisClient.connect();
  logger.info("Redis connected");
}

async function initKafka() {
  const kafka = new Kafka({
    clientId: "task-router-service",
    brokers: [KAFKA_BROKER],
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });

  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  logger.info("Kafka producer connected");
}

export async function checkDuplicate(input) {
  try {
    const messageHash = createHash("sha256")
      .update(`${input.channel}:${input.recipient}:${input.body}`)
      .digest("hex");

    const exists = await redisClient.get(`dedup:${messageHash}`);

    if (exists) {
      return true;
    }

    // Store hash with 24-hour expiry
    await redisClient.setEx(`dedup:${messageHash}`, 86400, "1");
    return false;
  } catch (error) {
    logger.error("Error checking duplicate", { error: error.message });
    // On error, allow message through (fail open)
    return false;
  }
}

export async function routeMessage(message) {
  const { channel, traceId, messageId } = message;
  const subtraceId = `subtrace_${Date.now()}`;

  try {
    // Determine target queue
    const queueName = QUEUES[channel];
    if (!queueName) {
      throw new Error(`Unknown channel: ${channel}`);
    }

    // Add retry metadata
    message.retryCount = 0;
    message.maxRetries = 3;
    message.subtraceId = subtraceId;

    // Send to RabbitMQ
    const sent = rabbitChannel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        headers: {
          "x-retry-count": 0,
          "x-trace-id": traceId,
          "x-subtrace-id": subtraceId,
        },
      }
    );

    if (!sent) {
      throw new Error("Failed to send message to queue");
    }

    // Log to Kafka
    await sendLog({
      service: "router",
      level: "info",
      message: "Message routed to queue",
      traceId,
      subtraceId,
      messageId,
      channel,
      queueName,
      timestamp: new Date().toISOString(),
    });

    logger.info("Message sent to queue", {
      traceId,
      subtraceId,
      messageId,
      channel,
      queueName,
    });
  } catch (error) {
    // Log error to Kafka
    await sendLog({
      service: "router",
      level: "error",
      message: "Failed to route message",
      traceId,
      subtraceId,
      messageId,
      channel,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    throw error;
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
  logger.info("Closing connections...");
  if (rabbitChannel) await rabbitChannel.close();
  if (rabbitConnection) await rabbitConnection.close();
  if (redisClient) await redisClient.quit();
  if (kafkaProducer) await kafkaProducer.disconnect();
  process.exit(0);
});
