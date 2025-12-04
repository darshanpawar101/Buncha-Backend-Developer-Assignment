import { GraphQLScalarType, Kind } from "graphql";
import { v4 as uuidv4 } from "uuid";
import { routeMessage, checkDuplicate } from "./router.js";
import { logger } from "./logger.js";

// JSON Scalar Type
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "JSON custom scalar type",
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return parseObject(ast);
    }
    return null;
  },
});

function parseObject(ast) {
  const value = Object.create(null);
  ast.fields.forEach((field) => {
    value[field.name.value] = parseLiteral(field.value);
  });
  return value;
}

function parseLiteral(ast) {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
      return parseObject(ast);
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
}

export const resolvers = {
  JSON: JSONScalar,

  Query: {
    health: () => "Task Router Service is healthy!",
  },

  Mutation: {
    sendMessage: async (_, { input }) => {
      const traceId = `trace_${uuidv4()}`;
      const startTime = Date.now();

      logger.info("Received message request", {
        traceId,
        channel: input.channel,
        recipient: input.recipient,
      });

      try {
        // Validate input
        if (!input.recipient || !input.body) {
          throw new Error("Recipient and body are required");
        }

        if (input.channel === "email" && !input.subject) {
          throw new Error("Subject is required for email messages");
        }

        // Validate recipient format
        if (input.channel === "email" && !isValidEmail(input.recipient)) {
          throw new Error("Invalid email address");
        }

        if (
          (input.channel === "sms" || input.channel === "whatsapp") &&
          !isValidPhone(input.recipient)
        ) {
          throw new Error("Invalid phone number format");
        }

        // Check for duplicates
        const isDuplicate = await checkDuplicate(input);
        if (isDuplicate) {
          logger.warn("Duplicate message detected", {
            traceId,
            channel: input.channel,
            recipient: input.recipient,
          });

          return {
            success: false,
            messageId: null,
            traceId,
            message: "Duplicate message detected",
          };
        }

        // Route message
        const messageId = `msg_${uuidv4()}`;
        const message = {
          messageId,
          traceId,
          ...input,
          timestamp: new Date().toISOString(),
          status: "queued",
        };

        await routeMessage(message);

        const duration = Date.now() - startTime;
        logger.info("Message routed successfully", {
          traceId,
          messageId,
          channel: input.channel,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          messageId,
          traceId,
          message: "Message queued successfully",
        };
      } catch (error) {
        logger.error("Error processing message", {
          traceId,
          error: error.message,
          stack: error.stack,
        });

        return {
          success: false,
          messageId: null,
          traceId,
          message: `Error: ${error.message}`,
        };
      }
    },
  },
};

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}
