#!/bin/bash
# Setup script for Stalwart Mail Server E2E testing environment
# This script waits for Stalwart to start and configures test accounts

set -e

STALWART_URL="${STALWART_URL:-http://localhost:8080}"
ADMIN_PASSWORD="${STALWART_ADMIN_PASSWORD:-admin123}"
MAX_WAIT=60
WAIT_INTERVAL=2

echo "Waiting for Stalwart to be ready..."

# Wait for Stalwart to be ready
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  if curl -s "${STALWART_URL}/jmap/session" > /dev/null 2>&1; then
    echo "Stalwart is ready!"
    break
  fi
  sleep $WAIT_INTERVAL
  elapsed=$((elapsed + WAIT_INTERVAL))
  echo "Waiting... ($elapsed/$MAX_WAIT seconds)"
done

if [ $elapsed -ge $MAX_WAIT ]; then
  echo "Error: Stalwart did not become ready in time"
  exit 1
fi

# Check if test user already exists and works
if curl -s -w "%{http_code}" -u "test@mail.example.com:password123" "${STALWART_URL}/jmap/session" -o /dev/null 2>/dev/null | grep -q "200"; then
  echo "Test user already configured, skipping setup..."
else
  echo "Setting up test accounts..."

  # Create domain
  echo "Creating domain mail.example.com..."
  curl -s -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
    -H "Content-Type: application/json" \
    -d '{"type": "domain", "name": "mail.example.com"}' > /dev/null || true

  # Create test user with "user" role for JMAP access
  echo "Creating test user..."
  curl -s -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "individual",
      "name": "test@mail.example.com",
      "secrets": ["password123"],
      "emails": ["test@mail.example.com"],
      "description": "Test user for E2E tests",
      "roles": ["user"]
    }' > /dev/null

  # Create recipient user with "user" role
  echo "Creating recipient user..."
  curl -s -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "individual",
      "name": "recipient@mail.example.com",
      "secrets": ["password123"],
      "emails": ["recipient@mail.example.com"],
      "description": "Recipient user for E2E tests",
      "roles": ["user"]
    }' > /dev/null
fi

# Create .env file for tests
ENV_FILE="$(dirname "$0")/../.env"
cat > "$ENV_FILE" << EOF
STALWART_SESSION_URL=http://localhost:8080/jmap/session
STALWART_USERNAME=test@mail.example.com
STALWART_PASSWORD=password123
STALWART_BASE_URL=http://localhost:8080
EOF

echo "Environment file created at $ENV_FILE"
echo "Setup complete! You can now run: deno task test"
