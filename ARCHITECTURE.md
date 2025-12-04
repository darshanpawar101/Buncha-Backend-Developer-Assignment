# System Architecture - Communication Aggregator

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  (Postman, GraphQL Playground, Frontend Apps, Mobile Apps)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP/GraphQL
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│             Task Router Service (Express + Apollo)              │
│                         Port: 4000                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • GraphQL API (/graphql)                               │    │
│  │  • REST Health Check (/health)                          │    │
│  │  • Input Validation                                     │    │
│  │  • Duplicate Detection (Redis)                          │    │
│  │  • Channel Routing Logic                                │    │
│  │  • Retry Mechanism                                      │    │
│  │  • Trace ID Generation                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└───┬─────────────────┬────────────────┬──────────────────────────┘
    │                 │                │
    │ RabbitMQ        │ Redis          │ Kafka (Logs)
    │ (Messages)      │ (Dedup)        │
    ▼                 ▼                ▼
┌───────────┐   ┌──────────┐    ┌─────────────┐
│ RabbitMQ  │   │  Redis   │    │   Kafka     │
│           │   │          │    │             │
│ Queues:   │   │ Dedup    │    │ Topics:     │
│ • email   │   │ Cache    │    │ • comms-    │
│ • sms     │   │ (24h TTL)│    │   logs      │
│ • whatsapp│   │          │    │             │
│ • dlq     │   └──────────┘    └─────┬───────┘
└─────┬─────┘                         │
      │                               │
      │ Consume Messages              │ Produce Logs
      ▼                               ▼
┌────────────────────────────────────────────────────────────────┐
│              Delivery Service (Express + Mongoose)             │
│                         Port: 4001                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • RabbitMQ Consumers (3 queues)                        │   │
│  │  • Email Delivery Handler                               │   │
│  │  • SMS Delivery Handler                                 │   │
│  │  • WhatsApp Delivery Handler                            │   │
│  │  • MongoDB Persistence                                  │   │
│  │  • Retry Logic (Exponential Backoff)                    │   │
│  │  • REST API:                                            │   │
│  │    - GET /health                                        │   │
│  │    - GET /messages/:messageId                           │   │
│  │    - GET /messages (pagination)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────┬──────────────────────────┘
                 │                    │
                 │ Store              │ Produce Logs
                 ▼                    ▼
         ┌──────────────┐      ┌─────────────┐
         │   MongoDB    │      │   Kafka     │
         │              │      │             │
         │ Collections: │      └──────┬──────┘
         │ • messages   │             │
         │              │             │
         │ Indexes:     │             │ Consume Logs
         │ • messageId  │             ▼
         │ • traceId    │      ┌────────────────────────────────┐
         │ • channel    │      │ Logging Service (Express)      │
         │ • status     │      │        Port: 4002              │
         └──────────────┘      │  ┌──────────────────────────┐  │
                               │  │ • Kafka Consumer         │  │
                               │  │ • Log Aggregation        │  │
                               │  │ • Elasticsearch Indexing │  │
                               │  │ • Trace Correlation      │  │
                               │  │ • REST API:              │  │
                               │  │   - GET /health          │  │
                               │  │   - GET /logs/trace/:id  │  │
                               │  │   - POST /logs/search    │  │
                               │  │   - GET /logs/stats      │  │
                               │  └──────────────────────────┘  │
                               └────────────┬───────────────────┘
                                            │
                                            │ Index Logs
                                            ▼
                               ┌───────────────────────────┐
                               │    Elasticsearch          │
                               │                           │
                               │  Indices:                 │
                               │  • communication-logs-*   │
                               │    (daily rotation)       │
                               │                           │
                               │  Mappings:                │
                               │  • traceId (keyword)      │
                               │  • service (keyword)      │
                               │  • level (keyword)        │
                               │  • channel (keyword)      │
                               │  • timestamp (date)       │
                               └───────────┬───────────────┘
                                           │
                                           │ Visualize
                                           ▼
                               ┌───────────────────────────┐
                               │        Kibana             │
                               │                           │
                               │  • Log Visualization      │
                               │  • Dashboard Creation     │
                               │  • Search & Analysis      │
                               │  • Real-time Monitoring   │
                               └───────────────────────────┘
```

## Component Details

### 1. Task Router Service (Express + Apollo GraphQL)

**Technology Stack:**

- Express.js 4.19.2
- Apollo Server 5.2.0 with Express integration
- GraphQL 16.12.0
- RabbitMQ (amqplib)
- Redis (redis client)
- Kafka (kafkajs)

**Responsibilities:**

- Accept incoming message requests via GraphQL API
- Validate message payload (email format, phone format, required fields)
- Check for duplicate messages using Redis
- Route messages to appropriate RabbitMQ queue based on channel
- Generate unique trace IDs for distributed tracing
- Send logs to Kafka for centralized logging
- Provide health check endpoint

**Endpoints:**

- `POST /graphql` - GraphQL endpoint for sending messages
- `GET /health` - Health check endpoint

**Key Features:**

- Duplicate detection using SHA-256 hash stored in Redis (24h TTL)
- Channel-based routing (email → email_queue, sms → sms_queue, etc.)
- Distributed tracing with unique trace IDs
- Error handling with GraphQL-formatted responses

### 2. Delivery Service (Express + Mongoose)

**Technology Stack:**

- Express.js 4.19.2
- Mongoose 9.0.0
- MongoDB
- RabbitMQ (amqplib)
- Kafka (kafkajs)

**Responsibilities:**

- Consume messages from RabbitMQ queues (email, sms, whatsapp)
- Execute delivery logic for each channel type
- Persist messages to MongoDB with status tracking
- Implement retry logic with exponential backoff
- Send failed messages to Dead Letter Queue (DLQ)
- Provide REST API for message status queries
- Send delivery logs to Kafka

**Endpoints:**

- `GET /health` - Health check with DB status
- `GET /messages/:messageId` - Get specific message details
- `GET /messages?page=1&limit=10` - Get all messages with pagination

**Retry Logic:**

- Attempt 1: Immediate
- Attempt 2: After 1 second
- Attempt 3: After 2 seconds
- Attempt 4: After 4 seconds
- After max retries: Move to DLQ

**MongoDB Schema:**

```javascript
{
  messageId: String (unique),
  traceId: String (indexed),
  channel: String (enum: email, sms, whatsapp),
  recipient: String,
  subject: String (optional, required for email),
  body: String,
  metadata: Object,
  status: String (enum: queued, processing, delivered, failed),
  deliveredAt: Date,
  failedAt: Date,
  errorMessage: String,
  retryCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### 3. Logging Service (Express + Elasticsearch)

**Technology Stack:**

- Express.js 4.19.2
- Kafka Consumer (kafkajs)
- Elasticsearch Client 8.11.0

**Responsibilities:**

- Consume logs from Kafka topic
- Index logs into Elasticsearch with daily rotation
- Provide REST API for log searching and analysis
- Aggregate statistics by service, level, and channel
- Support trace-based log correlation

**Endpoints:**

- `GET /health` - Health check with Elasticsearch status
- `GET /logs/trace/:traceId` - Get all logs for a specific trace
- `POST /logs/search` - Search logs with filters (service, level, channel, date range)
- `GET /logs/stats` - Get aggregated statistics

**Elasticsearch Index Template:**

```json
{
  "index_patterns": ["communication-logs-*"],
  "mappings": {
    "properties": {
      "timestamp": { "type": "date" },
      "service": { "type": "keyword" },
      "level": { "type": "keyword" },
      "traceId": { "type": "keyword" },
      "subtraceId": { "type": "keyword" },
      "messageId": { "type": "keyword" },
      "channel": { "type": "keyword" },
      "message": { "type": "text" }
    }
  }
}
```

## Data Flow

### Message Sending Flow

```
1. Client sends GraphQL mutation to Task Router Service
   ↓
2. Router validates input (email/phone format, required fields)
   ↓
3. Router checks Redis for duplicate (SHA-256 hash)
   ↓ (if not duplicate)
4. Router generates messageId and traceId
   ↓
5. Router sends message to appropriate RabbitMQ queue
   ↓
6. Router sends log to Kafka
   ↓
7. Router returns success response to client
   ↓
8. Delivery Service consumes message from queue
   ↓
9. Delivery Service attempts delivery with retry logic
   ↓
10. Delivery Service stores message in MongoDB
   ↓
11. Delivery Service sends delivery log to Kafka
   ↓
12. Logging Service consumes logs from Kafka
   ↓
13. Logging Service indexes logs in Elasticsearch
```

### Trace Correlation Flow

```
Request → traceId: trace_abc123
   ↓
Router Service
   └─ Log: { service: "router", traceId: "trace_abc123", subtraceId: "subtrace_001" }
   ↓
Delivery Service
   └─ Log: { service: "delivery", traceId: "trace_abc123", subtraceId: "subtrace_002" }
   ↓
Elasticsearch
   └─ Query by traceId returns complete journey
```

## Communication Patterns

### 1. RabbitMQ (Task Distribution)

- **Pattern:** Work Queue Pattern
- **Purpose:** Reliable message delivery with acknowledgments
- **Queues:**
  - `email_queue` - Email delivery tasks
  - `sms_queue` - SMS delivery tasks
  - `whatsapp_queue` - WhatsApp delivery tasks
  - `dead_letter_queue` - Failed messages after max retries
- **Features:**
  - Durable queues (survive broker restart)
  - Persistent messages (survive queue restart)
  - Manual acknowledgments (ensures delivery)
  - Dead Letter Exchange (handles failures)

### 2. Kafka (Event Streaming)

- **Pattern:** Publish-Subscribe Pattern
- **Purpose:** High-throughput log aggregation
- **Topics:**
  - `communication-logs` - All service logs
- **Features:**
  - Partitioning for scalability
  - Consumer groups for parallel processing
  - Message retention for replay capability
  - High throughput (thousands of logs/second)

### 3. Redis (Caching)

- **Pattern:** Cache-Aside Pattern
- **Purpose:** Fast duplicate detection
- **Features:**
  - In-memory operations (microsecond latency)
  - TTL-based expiration (24 hours)
  - SHA-256 hashing for message fingerprinting

## Scalability Considerations

### Horizontal Scaling

- **Router Service**: Multiple instances behind load balancer
- **Delivery Service**: Multiple consumers per queue
- **Logging Service**: Consumer group with multiple instances

### Vertical Scaling

- **MongoDB**: Indexes on messageId, traceId for fast queries
- **Elasticsearch**: Sharding for large log volumes
- **RabbitMQ**: Queue partitioning for high throughput

## Reliability & Resilience

### Error Handling

1. **Input Validation**: Reject invalid requests early
2. **Retry Logic**: Exponential backoff for transient failures
3. **Dead Letter Queue**: Capture permanently failed messages
4. **Circuit Breakers**: Prevent cascade failures (future enhancement)

### Monitoring

1. **Health Checks**: All services expose `/health` endpoints
2. **Distributed Tracing**: Trace IDs for end-to-end visibility
3. **Centralized Logging**: All logs in Elasticsearch
4. **Metrics**: Service-level statistics via Logging Service API


## Performance Metrics

### Expected Performance

- **Router Service**: ~1000 requests/second
- **Delivery Service**: ~500 deliveries/second per instance
- **Logging Service**: ~5000 logs/second
- **End-to-End Latency**: <500ms (router to delivery)

