import { Kafka } from "kafkajs";
import { indexLog } from "./elasticsearch.js";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_GROUP_ID = "logging-service-group";
const KAFKA_TOPIC = "communication-logs";

let consumer;

export async function initializeConsumer() {
  try {
    const kafka = new Kafka({
      clientId: "logging-service",
      brokers: [KAFKA_BROKER],
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    consumer = kafka.consumer({
      groupId: KAFKA_GROUP_ID,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    console.log("Kafka consumer connected");

    // Subscribe to logs topic
    await consumer.subscribe({
      topic: KAFKA_TOPIC,
      fromBeginning: false,
    });

    // Start consuming messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const logData = JSON.parse(message.value.toString());

          console.log("Received log:", {
            service: logData.service,
            level: logData.level,
            traceId: logData.traceId,
            message: logData.message,
          });

          // Index log in Elasticsearch
          await indexLog(logData);

          console.log("Log indexed successfully:", logData.traceId);
        } catch (error) {
          console.error("Error processing log message:", error.message);
          // Don't throw - continue processing other messages
        }
      },
    });

    console.log(`Subscribed to topic: ${KAFKA_TOPIC}`);
  } catch (error) {
    console.error("Failed to initialize Kafka consumer:", error.message);
    throw error;
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Disconnecting Kafka consumer...");
  if (consumer) {
    await consumer.disconnect();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Disconnecting Kafka consumer...");
  if (consumer) {
    await consumer.disconnect();
  }
  process.exit(0);
});
