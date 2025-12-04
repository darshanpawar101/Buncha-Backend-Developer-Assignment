import { Client } from "@elastic/elasticsearch";

const ELASTICSEARCH_URL =
  process.env.ELASTICSEARCH_URL || "http://localhost:9200";
const INDEX_PREFIX = "communication-logs";

let esClient;

export async function initializeElasticsearch() {
  try {
    esClient = new Client({
      node: ELASTICSEARCH_URL,
      requestTimeout: 30000,
      pingTimeout: 3000,
    });

    // Test connection
    const health = await esClient.cluster.health();
    console.log("Elasticsearch cluster health:", health.status);

    return esClient;
  } catch (error) {
    console.error("Failed to connect to Elasticsearch:", error.message);
    throw error;
  }
}

export async function ensureIndexTemplate() {
  try {
    const templateName = "communication-logs-template";

    // Check if template exists
    const templateExists = await esClient.indices.existsIndexTemplate({
      name: templateName,
    });

    if (!templateExists) {
      // Create index template
      await esClient.indices.putIndexTemplate({
        name: templateName,
        body: {
          index_patterns: [`${INDEX_PREFIX}-*`],
          template: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              "index.refresh_interval": "5s",
            },
            mappings: {
              properties: {
                timestamp: { type: "date" },
                service: { type: "keyword" },
                level: { type: "keyword" },
                message: { type: "text" },
                traceId: { type: "keyword" },
                subtraceId: { type: "keyword" },
                messageId: { type: "keyword" },
                channel: { type: "keyword" },
                queueName: { type: "keyword" },
                recipient: { type: "keyword" },
                subject: { type: "text" },
                body: { type: "text" },
                error: { type: "text" },
                duration: { type: "keyword" },
                retryCount: { type: "integer" },
                metadata: { type: "object", enabled: false },
              },
            },
          },
        },
      });

      console.log("Index template created successfully");
    } else {
      console.log("Index template already exists");
    }
  } catch (error) {
    console.error("Error creating index template:", error.message);
    throw error;
  }
}

export async function indexLog(logData) {
  try {
    // Generate index name based on date (daily indices)
    const date = new Date().toISOString().split("T")[0];
    const indexName = `${INDEX_PREFIX}-${date}`;

    // Index the log document
    await esClient.index({
      index: indexName,
      document: {
        ...logData,
        "@timestamp": logData.timestamp || new Date().toISOString(),
        indexed_at: new Date().toISOString(),
      },
    });

    console.log(`Log indexed to ${indexName}:`, {
      traceId: logData.traceId,
      service: logData.service,
      level: logData.level,
    });
  } catch (error) {
    console.error("Failed to index log:", error.message);
    // Don't throw - log the error but continue
    console.error("Failed log data:", JSON.stringify(logData, null, 2));
  }
}

export function getClient() {
  return esClient;
}
