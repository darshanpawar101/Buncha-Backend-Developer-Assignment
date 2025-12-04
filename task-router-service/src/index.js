import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";

import { logger } from "./logger.js";
import { initializeConnections } from "./router.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Initialize Express app
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Initialize all connections (RabbitMQ, Redis, Kafka)
    await initializeConnections();
    logger.info("All connections initialized");

    // Create Apollo Server
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      formatError: (error) => {
        logger.error("GraphQL Error", {
          message: error.message,
          path: error.path,
          extensions: error.extensions,
        });
        return error;
      },
    });

    await server.start();
    logger.info("Apollo Server started");

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "task-router-service",
        timestamp: new Date().toISOString(),
      });
    });

    // GraphQL endpoint
    app.use(
      "/graphql",
      expressMiddleware(server, {
        context: async ({ req }) => ({
          req,
          traceId: req.headers["x-trace-id"],
          timestamp: new Date().toISOString(),
        }),
      })
    );

    // Start Express server
    app.listen(PORT, () => {
      logger.info(
        `🚀 Task Router Service ready at http://localhost:${PORT}/graphql`
      );
      logger.info(
        `📊 Health check available at http://localhost:${PORT}/health`
      );
    });
  } catch (error) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
});

startServer();
