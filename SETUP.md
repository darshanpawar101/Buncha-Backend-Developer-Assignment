# Setup Guide - Communication Aggregator System

## Step-by-Step Installation

### 1. Prerequisites Check

```bash
# Check Node.js version (should be 18+)
node --version

# Check Docker
docker --version
docker-compose --version

# Check available ports
lsof -i :4000,4001,4002,5672,9092,6379,27017,9200,5601
```

### 2. Project Structure Setup

```bash
# Create project directory
mkdir communication-aggregator
cd communication-aggregator

# Create service directories
mkdir -p task-router-service/src
mkdir -p delivery-service/src
mkdir -p logging-service/src
```

### 3. Copy Files

Copy all the provided files to their respective locations:

- `docker-compose.yml` → Root directory
- Task Router Service files → `task-router-service/`
- Delivery Service files → `delivery-service/`
- Logging Service files → `logging-service/`
- `Communication-Aggregator.postman_collection.json` → Root directory

### 4. Start Infrastructure

```bash
# Start all infrastructure services
docker-compose up -d

# Wait for services to be healthy (60-90 seconds)
docker-compose ps

# Check logs if needed
docker-compose logs -f
```

### 5. Verify Infrastructure

#### RabbitMQ

```bash
# Check RabbitMQ is running
curl http://localhost:15672

# Login to Management UI
# URL: http://localhost:15672
# Username: guest
# Password: guest
```

#### Kafka

```bash
# Check Kafka topics (after services start)
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092
```

#### Redis

```bash
# Test Redis connection
docker exec -it redis redis-cli ping
# Should return: PONG
```

#### MongoDB

```bash
# Test MongoDB connection
docker exec -it mongodb mongosh --eval "db.version()"
```

#### Elasticsearch

```bash
# Check Elasticsearch health
curl http://localhost:9200/_cluster/health
```

#### Kibana

```bash
# Wait for Kibana to be ready (may take 2-3 minutes)
curl http://localhost:5601/api/status
```

### 6. Install Service Dependencies

#### Task Router Service

```bash
cd task-router-service
npm install
```

#### Delivery Service

```bash
cd ../delivery-service
npm install
```

#### Logging Service

```bash
cd ../logging-service
npm install
```

### 7. Start Services

**Important**: Start services in separate terminal windows

#### Terminal 1 - Task Router Service

```bash
cd task-router-service
npm start
```

Wait for: "🚀 Task Router Service ready at http://localhost:4000/graphql"

#### Terminal 2 - Delivery Service

```bash
cd delivery-service
npm start
```

Wait for: "🚀 Delivery Service ready on port 4001"

#### Terminal 3 - Logging Service

```bash
cd logging-service
npm start
```

Wait for: "🚀 Logging Service ready on port 4002"

### 8. Test the System

#### Quick Test with curl

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { sendMessage(input: { channel: email, recipient: \"test@example.com\", subject: \"Test\", body: \"Hello World\" }) { success messageId traceId message } }"
  }'
```

#### Using GraphQL Playground

1. Open browser: `http://localhost:4000/graphql`
2. Paste the following query:

```graphql
mutation {
  sendMessage(
    input: {
      channel: email
      recipient: "test@example.com"
      subject: "Test Message"
      body: "This is a test"
    }
  ) {
    success
    messageId
    traceId
    message
  }
}
```

### 9. Setup Kibana Dashboards

#### Access Kibana

1. Open: `http://localhost:5601`
2. Wait for initial load (1-2 minutes on first access)

#### Create Index Pattern

1. Navigate to: **Management → Stack Management → Index Patterns**
2. Click: **Create index pattern**
3. Index pattern name: `communication-logs-*`
4. Click: **Next step**
5. Time field: `@timestamp`
6. Click: **Create index pattern**

#### View Logs

1. Navigate to: **Analytics → Discover**
2. Select index pattern: `communication-logs-*`
3. You should see logs appearing in real-time

#### Useful Kibana Queries

```
# Find all logs for a specific trace
traceId: "trace_xyz123"

# Find errors
level: "error"

# Find logs from router service
service: "router"

# Find logs for specific channel
channel: "email"

# Combination query
service: "delivery" AND level: "error" AND channel: "sms"
```

### 10. Import Postman Collection

1. Open Postman
2. Click **Import** → **Upload Files**
3. Select `Communication-Aggregator.postman_collection.json`
4. Collection will appear in sidebar
5. Try running requests in order

### 11. Verify Complete Flow

#### Send a Test Message

```bash
# Use Postman or curl to send an email
```

#### Check RabbitMQ

1. Go to: `http://localhost:15672`
2. Click: **Queues**
3. Verify message was processed (queue should be empty if delivered)

#### Check MongoDB

```bash
# Connect to MongoDB
docker exec -it mongodb mongosh

# Switch to communication database
use communication

# Check stored messages
db.messages.find().pretty()

# Exit
exit
```

#### Check Elasticsearch

```bash
# View indexed logs
curl http://localhost:9200/communication-logs-*/_search?pretty

# Count logs
curl http://localhost:9200/communication-logs-*/_count
```

## Troubleshooting

### Services Won't Start

#### Infrastructure Not Ready

```bash
# Check all containers are running
docker-compose ps

# Restart specific service
docker-compose restart rabbitmq

# View logs
docker-compose logs rabbitmq
docker-compose logs kafka
docker-compose logs elasticsearch
```

#### Port Already in Use

```bash
# Find process using port
lsof -i :4000

# Kill process
kill -9
```

### Messages Not Being Delivered

#### Check RabbitMQ Queues

1. Management UI: `http://localhost:15672`
2. Check if messages are stuck in queue
3. Look for errors in "Dead Letter Queue"

#### Check Service Logs

```bash
# Router service
cd task-router-service
npm start # Check console output

# Delivery service
cd delivery-service
npm start # Check console output
```

#### Manual Queue Inspection

```bash
# Connect to RabbitMQ container
docker exec -it rabbitmq rabbitmqctl list_queues

# Purge a queue if needed (for testing)
docker exec -it rabbitmq rabbitmqctl purge_queue email_queue
```

### Logs Not Appearing in Kibana

#### Check Kafka Topics

```bash
# List topics
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# Create topic manually if needed
docker exec -it kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic communication-logs \
  --partitions 1 \
  --replication-factor 1
```

#### Check Elasticsearch

```bash
# Check if indices exist
curl http://localhost:9200/_cat/indices

# Check index template
curl http://localhost:9200/_index_template/communication-logs-template?pretty
```

#### Restart Logging Service

```bash
cd logging-service
# Kill existing process (Ctrl+C)
npm start
```

### Redis Connection Issues

```bash
# Test Redis
docker exec -it redis redis-cli ping

# Restart Redis
docker-compose restart redis

# Check Redis keys
docker exec -it redis redis-cli KEYS "*"
```

### MongoDB Connection Issues

```bash
# Check MongoDB status
docker exec -it mongodb mongosh --eval "db.serverStatus()"

# Restart MongoDB
docker-compose restart mongodb
```

## Performance Testing

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Create test script: load-test.yml
artillery quick --count 100 --num 10 http://localhost:4000/graphql
```

### Monitor Resource Usage

```bash
# Watch Docker stats
docker stats

# Watch service logs
tail -f task-router-service/logs.txt
```

## Clean Restart

### Stop Everything

```bash
# Stop all services (Ctrl+C in each terminal)

# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: Deletes all data)
docker-compose down -v
```

### Fresh Start

```bash
# Start infrastructure
docker-compose up -d

# Wait for services to be healthy
sleep 60

# Start services in separate terminals
cd task-router-service && npm start
cd delivery-service && npm start
cd logging-service && npm start
```

## Development Tips

### Watch Mode (Auto-restart on changes)

```bash
# Install nodemon globally
npm install -g nodemon

# Start services with nodemon
cd task-router-service
npm run dev
```

### Environment Variables

Create `.env` files in each service directory:

**task-router-service/.env**

```env
PORT=4000
RABBITMQ_URL=amqp://localhost:5672
REDIS_URL=redis://localhost:6379
KAFKA_BROKER=localhost:9092
```

**delivery-service/.env**

```env
PORT=4001
RABBITMQ_URL=amqp://localhost:5672
MONGODB_URL=mongodb://localhost:27017/communication
KAFKA_BROKER=localhost:9092
```

**logging-service/.env**

```env
PORT=4002
KAFKA_BROKER=localhost:9092
ELASTICSEARCH_URL=http://localhost:9200
```

### Debug Mode

```bash
# Start with debug logs
NODE_ENV=development npm start
```

## Next Steps

1. Test all API endpoints using Postman collection
2. Monitor logs in Kibana
3. Check message delivery in MongoDB
4. Experiment with different channels (email, sms, whatsapp)
5. Test duplicate detection by sending same message twice
6. Observe retry mechanism by checking delivery service logs

## Support

If you encounter issues:

1. Check service logs
2. Verify infrastructure health
3. Review this troubleshooting guide
4. Check Docker container logs: `docker-compose logs <service-name>`
