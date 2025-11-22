#!/bin/bash

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
cub kafka-ready -b kafka:29092 1 60

echo "Creating Kafka topics..."

# Create email-tasks topic (3 partitions, replication factor 1 for local development)
kafka-topics --create \
  --bootstrap-server kafka:29092 \
  --topic email-tasks \
  --partitions 3 \
  --replication-factor 1 \
  --if-not-exists \
  --config retention.ms=604800000

echo "✓ Created topic: email-tasks (3 partitions, 7 days retention)"

# Create notification-tasks topic (2 partitions, replication factor 1)
kafka-topics --create \
  --bootstrap-server kafka:29092 \
  --topic notification-tasks \
  --partitions 2 \
  --replication-factor 1 \
  --if-not-exists \
  --config retention.ms=604800000

echo "✓ Created topic: notification-tasks (2 partitions, 7 days retention)"

# Create analytics-events topic (4 partitions, replication factor 1)
kafka-topics --create \
  --bootstrap-server kafka:29092 \
  --topic analytics-events \
  --partitions 4 \
  --replication-factor 1 \
  --if-not-exists \
  --config retention.ms=2592000000

echo "✓ Created topic: analytics-events (4 partitions, 30 days retention)"

echo ""
echo "All Kafka topics created successfully!"
echo ""
echo "Listing all topics:"
kafka-topics --list --bootstrap-server kafka:29092

echo ""
echo "Topic details:"
kafka-topics --describe --bootstrap-server kafka:29092
