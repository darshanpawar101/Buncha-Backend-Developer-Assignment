import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { initializeConsumer } from "./consumer.js";
import {
  ensureIndexTemplate,
  getClient,
  initializeElasticsearch,
} from "./elasticsearch.js";

dotenv.config();

const PORT = process.env.PORT || 4002;

async function startService() {
  try {
    // Initialize Express app
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    console.log("Starting Logging Service...");

    // Initialize Elasticsearch
    await initializeElasticsearch();
    await ensureIndexTemplate();
    console.log("Elasticsearch initialized");

    // Initialize Kafka consumer
    await initializeConsumer();
    console.log("Kafka consumer initialized");

    // Health check endpoint
    app.get("/health", async (req, res) => {
      try {
        const esClient = getClient();
        const esHealth = await esClient.cluster.health();

        res.json({
          status: "healthy",
          service: "logging-service",
          elasticsearch: esHealth.status,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "unhealthy",
          service: "logging-service",
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Search logs by traceId
    app.get("/logs/trace/:traceId", async (req, res) => {
      try {
        const esClient = getClient();
        const { traceId } = req.params;

        const result = await esClient.search({
          index: "communication-logs-*",
          body: {
            query: {
              match: { traceId },
            },
            sort: [{ timestamp: "asc" }],
            size: 100,
          },
        });

        res.json({
          traceId,
          count: result.hits.hits.length,
          logs: result.hits.hits.map((hit) => hit._source),
        });
      } catch (error) {
        console.error("Error searching logs:", error.message);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Search logs with filters
    app.post("/logs/search", async (req, res) => {
      try {
        const esClient = getClient();
        const { service, level, channel, from, to, size = 50 } = req.body;

        const must = [];

        if (service) must.push({ match: { service } });
        if (level) must.push({ match: { level } });
        if (channel) must.push({ match: { channel } });

        if (from || to) {
          const range = { timestamp: {} };
          if (from) range.timestamp.gte = from;
          if (to) range.timestamp.lte = to;
          must.push({ range });
        }

        const result = await esClient.search({
          index: "communication-logs-*",
          body: {
            query: must.length > 0 ? { bool: { must } } : { match_all: {} },
            sort: [{ timestamp: "desc" }],
            size,
          },
        });

        res.json({
          count: result.hits.hits.length,
          total: result.hits.total.value,
          logs: result.hits.hits.map((hit) => hit._source),
        });
      } catch (error) {
        console.error("Error searching logs:", error.message);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get log statistics
    app.get("/logs/stats", async (req, res) => {
      try {
        const esClient = getClient();

        const result = await esClient.search({
          index: "communication-logs-*",
          body: {
            size: 0,
            aggs: {
              by_service: {
                terms: { field: "service" },
              },
              by_level: {
                terms: { field: "level" },
              },
              by_channel: {
                terms: { field: "channel" },
              },
            },
          },
        });

        res.json({
          total: result.hits.total.value,
          by_service: result.aggregations.by_service.buckets,
          by_level: result.aggregations.by_level.buckets,
          by_channel: result.aggregations.by_channel.buckets,
        });
      } catch (error) {
        console.error("Error getting stats:", error.message);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Logging Service ready at http://localhost:${PORT}`);
      console.log(
        `📊 Health check available at http://localhost:${PORT}/health`
      );
    });
  } catch (error) {
    console.error("Failed to start service:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});

startService();
