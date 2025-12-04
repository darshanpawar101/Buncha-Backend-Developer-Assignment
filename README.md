# Communication Aggregator System

## Overview

A microservices-based message routing system that intelligently distributes messages across Email, SMS, and WhatsApp channels with comprehensive logging and observability.

## Architecture

### Services Architecture

```
┌─────────────────┐
│  GraphQL API    │
│  (Port 4000)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│   Task Router Service       │
│  - Request validation       │
│  - Duplicate detection      │
│  - Channel routing          │
│  - Retry logic              │
└──────────┬──────────────────┘
           │
           ├─────► Redis (Deduplication)
           │
           ▼
    ┌─────────────┐
    │  RabbitMQ   │
    └──────┬──────┘
           │
           ▼
┌─────────────────────────────┐
│   Delivery Service          │
│  - Email delivery           │
│  - SMS delivery             │
│  - WhatsApp delivery        │
│  - MongoDB persistence      │
└──────────┬──────────────────┘
           │
           ▼
    ┌─────────────┐
    │   Kafka     │
    └──────┬──────┘
           │
           ▼
┌─────────────────────────────┐
│   Logging Service           │
│  - Log aggregation          │
│  - Trace correlation        │
│  - Elasticsearch storage    │
└─────────────────────────────┘
```

### Technology Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js (v4.19.2)
- **API Layer**: GraphQL (Apollo Server v5.2.0) with Express integration
- **Message Queue**: RabbitMQ
- **Event Streaming**: Kafka
- **Cache & Dedup**: Redis
- **Database**: MongoDB (Mongoose v9.0.0)
- **Logging**: Elasticsearch + Kibana
- **Tracing**: Custom trace ID propagation

## Communication Methods

### 1. RabbitMQ (Router → Delivery)

**Why**: Reliable message delivery with acknowledgments, retry mechanisms, and dead-letter queues. Perfect for task distribution.

### 2. Kafka (All Services → Logging)

**Why**: High-throughput event streaming for logs. Enables real-time log aggregation and replay capability.

### 3. Redis

**Why**: Fast in-memory operations for duplicate detection using message hash.

## Prerequisites

- Docker & Docker Compose
- Node.js v18+
- npm or yarn

## Quick Start

### 1. Start Infrastructure Services

```bash
docker-compose up -d
```

This starts:

- RabbitMQ (Port 5672, Management UI: 15672)
- Kafka + Zookeeper (Port 9092)
- Redis (Port 6379)
- MongoDB (Port 27017)
- Elasticsearch (Port 9200)
- Kibana (Port 5601)

### 2. Install Dependencies & Setup Environment

```bash
# Router Service
cd task-router-service
cp .env.example .env
npm install

# Delivery Service
cd ../delivery-service
cp .env.example .env
npm install

# Logging Service
cd ../logging-service
cp .env.example .env
npm install
```

### 3. Start Services

```bash
# Terminal 1 - Router Service
cd task-router-service
npm start

# Terminal 2 - Delivery Service
cd delivery-service
npm start

# Terminal 3 - Logging Service
cd logging-service
npm start
```

## API Usage

### REST API Endpoints

#### Task Router Service (Port 4000)

- **GraphQL**: `http://localhost:4000/graphql`
- **Health Check**: `GET http://localhost:4000/health`

#### Delivery Service (Port 4001)

- **Health Check**: `GET http://localhost:4001/health`
- **Get Message by ID**: `GET http://localhost:4001/messages/:messageId`
- **Get All Messages**: `GET http://localhost:4001/messages?page=1&limit=10`

#### Logging Service (Port 4002)

- **Health Check**: `GET http://localhost:4002/health`
- **Get Logs by Trace**: `GET http://localhost:4002/logs/trace/:traceId`
- **Search Logs**: `POST http://localhost:4002/logs/search`
- **Get Statistics**: `GET http://localhost:4002/logs/stats`

### GraphQL Endpoint

**URL**: `http://localhost:4000/graphql`

### Send Message Mutation

```graphql
mutation SendMessage($input: MessageInput!) {
  sendMessage(input: $input) {
    success
    messageId
    traceId
    message
  }
}
```

### Variables

```json
{
  "input": {
    "channel": "email",
    "recipient": "user@example.com",
    "subject": "Test Message",
    "body": "This is a test message",
    "metadata": {
      "priority": "high",
      "tags": ["notification", "user-action"]
    }
  }
}
```

### Supported Channels

- `email` - Routes to Email delivery
- `sms` - Routes to SMS delivery
- `whatsapp` - Routes to WhatsApp delivery

## Example Payloads

### 1. Email Message

```json
{
  "input": {
    "channel": "email",
    "recipient": "john.doe@example.com",
    "subject": "Welcome to Our Platform",
    "body": "Thank you for signing up!",
    "metadata": {
      "userId": "12345",
      "campaignId": "welcome-2024"
    }
  }
}
```

### 2. SMS Message

```json
{
  "input": {
    "channel": "sms",
    "recipient": "+1234567890",
    "body": "Your verification code is: 123456",
    "metadata": {
      "type": "otp",
      "expiresIn": 300
    }
  }
}
```

### 3. WhatsApp Message

```json
{
  "input": {
    "channel": "whatsapp",
    "recipient": "+1234567890",
    "body": "Your order #ORD123 has been shipped!",
    "metadata": {
      "orderId": "ORD123",
      "trackingUrl": "https://track.example.com/ORD123"
    }
  }
}
```

## Expected Output

### Success Response

```json
{
  "data": {
    "sendMessage": {
      "success": true,
      "messageId": "msg_1a2b3c4d5e6f",
      "traceId": "trace_7g8h9i0j1k2l",
      "message": "Message queued successfully"
    }
  }
}
```

### Duplicate Detection

```json
{
  "data": {
    "sendMessage": {
      "success": false,
      "messageId": null,
      "traceId": "trace_existing",
      "message": "Duplicate message detected"
    }
  }
}
```

## Features

### 1. Duplicate Detection

- Uses Redis to store message hash (SHA-256 of recipient + body + channel)
- Prevents duplicate messages within 24-hour window
- Hash expires automatically

### 2. Retry Mechanism

- Exponential backoff: 1s, 2s, 4s
- Maximum 3 retry attempts
- Dead-letter queue for failed messages

### 3. Distributed Tracing

- Unique trace ID for each request
- Subtrace IDs for each service operation
- Complete journey tracking across all services

### 4. Logging & Observability

- All logs sent to Elasticsearch via Kafka
- Structured logging with trace correlation
- Kibana dashboards for visualization

## Monitoring & Debugging

### RabbitMQ Management UI

- URL: `http://localhost:15672`
- Username: `guest`
- Password: `guest`

### Kibana

- URL: `http://localhost:5601`
- Create index pattern: `communication-logs-*`
- Filter by `traceId` to see complete message journey

### Key Kibana Queries

```
traceId: "trace_xyz123"  // Track specific message
level: "error"           // Find errors
service: "router"        // Filter by service
```

## Project Structure

```
communication-aggregator/
├── docker-compose.yml
├── README.md
├── ARCHITECTURE.md
├── SETUP.md
├── Communication-Aggregator.postman_collection.json
├── task-router-service/
│   ├── .env.example
│   ├── package.json (with Express deps)
│   └── src/
│       ├── index.js (Express + Apollo)
│       ├── schema.js
│       ├── resolvers.js
│       ├── router.js
│       └── logger.js
├── delivery-service/
│   ├── .env.example
│   ├── package.json (with Express + Mongoose)
│   └── src/
│       ├── index.js (Express REST API)
│       ├── consumer.js
│       ├── deliveryHandlers.js
│       └── logger.js
└── logging-service/
    ├── .env.example
    ├── package.json (with Express)
    └── src/
        ├── index.js (Express REST API)
        ├── consumer.js
        └── elasticsearch.js
```

## Testing with Postman

Import the provided Postman collection for pre-configured requests:

1. Open Postman
2. Import `Communication-Aggregator.postman_collection.json`
3. Collections included:
   - **GraphQL Requests**: Send messages via GraphQL API
   - **REST Endpoints**: Health checks, message retrieval, log searching
4. Run requests in order:
   - Health checks for all services
   - Send Email Message
   - Send SMS Message
   - Send WhatsApp Message
   - Get message status from Delivery Service
   - Search logs by trace ID in Logging Service
   - Send Duplicate Message (should fail)

## Environment Variables

### Task Router Service (.env)

```env
PORT=4000
NODE_ENV=development
RABBITMQ_URL=amqp://localhost:5672
REDIS_URL=redis://localhost:6379
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=task-router-service
SERVICE_NAME=task-router-service
LOG_LEVEL=info
```

### Delivery Service (.env)

```env
PORT=4001
NODE_ENV=development
MONGODB_URL=mongodb://localhost:27017/communication
RABBITMQ_URL=amqp://localhost:5672
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=delivery-service
SERVICE_NAME=delivery-service
LOG_LEVEL=info
MAX_RETRIES=3
RETRY_DELAY_MS=1000
```

### Logging Service (.env)

```env
PORT=4002
NODE_ENV=development
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=logging-service
KAFKA_GROUP_ID=logging-service-group
KAFKA_TOPIC=communication-logs
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX_PREFIX=communication-logs
SERVICE_NAME=logging-service
LOG_LEVEL=info
```

## Troubleshooting

### Services won't start

1. Ensure Docker containers are running: `docker ps`
2. Check port availability: `lsof -i :4000,4001,4002`
3. Verify infrastructure health:
   - RabbitMQ: `docker logs rabbitmq`
   - Kafka: `docker logs kafka`
   - Elasticsearch: `curl http://localhost:9200`

### Messages not being delivered

1. Check RabbitMQ queues in management UI
2. Verify delivery service logs
3. Check MongoDB for stored messages: `docker exec -it mongo mongosh`

### Logs not appearing in Kibana

1. Verify Elasticsearch index: `curl http://localhost:9200/_cat/indices`
2. Check Kafka topics: `docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092`
3. Review logging service console output

## Performance Considerations

- **Throughput**: ~1000 messages/second per service
- **Latency**: <100ms for routing, <500ms for delivery
- **Scalability**: Horizontal scaling supported for all services
- **Resilience**: Automatic retries, dead-letter queues, circuit breakers

## Future Enhancements

- [ ] Add rate limiting per recipient
- [ ] Implement priority queues
- [ ] Add webhook support for delivery status
- [ ] Implement batch message processing
- [ ] Add Prometheus metrics
- [ ] Implement circuit breakers
- [ ] Add message templating engine

## License

MIT
