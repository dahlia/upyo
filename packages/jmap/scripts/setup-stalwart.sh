#!/bin/bash
# Setup script for Stalwart Mail Server E2E testing environment
# This script waits for Stalwart to start and configures test accounts

set -e

STALWART_URL="${STALWART_URL:-http://localhost:8080}"
ADMIN_PASSWORD="${STALWART_ADMIN_PASSWORD:-admin123}"
MAX_WAIT=60
WAIT_INTERVAL=2
TEST_USERNAME="test@mail.example.com"
TEST_PASSWORD="password123"

wait_for_authenticated_session() {
  echo "Waiting for authenticated JMAP session..."

  elapsed=0
  while [ $elapsed -lt $MAX_WAIT ]; do
    if curl -s -w "%{http_code}" -u "${TEST_USERNAME}:${TEST_PASSWORD}" \
      "${STALWART_URL}/jmap/session" -o /dev/null 2>/dev/null | grep -q "200"
    then
      echo "Authenticated JMAP session is ready!"
      return 0
    fi
    sleep $WAIT_INTERVAL
    elapsed=$((elapsed + WAIT_INTERVAL))
    echo "Waiting for authenticated session... ($elapsed/$MAX_WAIT seconds)"
  done

  echo "Error: authenticated JMAP session did not become ready in time"
  return 1
}

get_mail_account_id() {
  curl -s -u "${TEST_USERNAME}:${TEST_PASSWORD}" \
    "${STALWART_URL}/jmap/session" 2>/dev/null |
    sed -n 's/.*"primaryAccounts":{[^}]*"urn:ietf:params:jmap:mail":"\([^"]*\)".*/\1/p'
}

wait_for_mailbox_ready() {
  echo "Waiting for JMAP mailboxes..."

  elapsed=0
  while [ $elapsed -lt $MAX_WAIT ]; do
    account_id=$(get_mail_account_id)
    if [ -z "$account_id" ]; then
      sleep $WAIT_INTERVAL
      elapsed=$((elapsed + WAIT_INTERVAL))
      echo "Waiting for mail account... ($elapsed/$MAX_WAIT seconds)"
      continue
    fi

    response=$(curl -s -u "${TEST_USERNAME}:${TEST_PASSWORD}" \
      -H "Content-Type: application/json" \
      -d "{
        \"using\": [
          \"urn:ietf:params:jmap:core\",
          \"urn:ietf:params:jmap:mail\"
        ],
        \"methodCalls\": [[
          \"Mailbox/get\",
          {
            \"accountId\": \"${account_id}\",
            \"properties\": [\"id\", \"role\", \"name\"]
          },
          \"c0\"
        ]]
      }" \
      "${STALWART_URL}/jmap" 2>/dev/null || true)

    if echo "$response" | grep -q '"Mailbox/get"' &&
      echo "$response" | grep -q '"role":"drafts"'
    then
      echo "JMAP mailboxes are ready!"
      return 0
    fi
    sleep $WAIT_INTERVAL
    elapsed=$((elapsed + WAIT_INTERVAL))
    echo "Waiting for JMAP mailboxes... ($elapsed/$MAX_WAIT seconds)"
  done

  echo "Error: JMAP mailboxes did not become ready in time"
  return 1
}

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
if curl -s -w "%{http_code}" -u "${TEST_USERNAME}:${TEST_PASSWORD}" "${STALWART_URL}/jmap/session" -o /dev/null 2>/dev/null | grep -q "200"; then
  echo "Test user already configured, skipping setup..."
else
  echo "Setting up test accounts..."

  # Create domain
  echo "Creating domain mail.example.com..."
  curl -fsS -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
    -H "Content-Type: application/json" \
    -d '{"type": "domain", "name": "mail.example.com"}' > /dev/null || true

  # Create test user with "user" role for JMAP access
  echo "Creating test user..."
  curl -fsS -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "individual",
      "name": "'"${TEST_USERNAME}"'",
      "secrets": ["'"${TEST_PASSWORD}"'"],
      "emails": ["'"${TEST_USERNAME}"'"],
      "description": "Test user for E2E tests",
      "roles": ["user"]
    }' > /dev/null

  # Create recipient user with "user" role
  echo "Creating recipient user..."
  curl -fsS -u "admin:${ADMIN_PASSWORD}" -X POST "${STALWART_URL}/api/principal" \
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

wait_for_authenticated_session
wait_for_mailbox_ready

# Create .env file for tests
ENV_FILE="$(dirname "$0")/../.env"
cat > "$ENV_FILE" << EOF
STALWART_SESSION_URL=http://localhost:8080/jmap/session
STALWART_USERNAME=${TEST_USERNAME}
STALWART_PASSWORD=${TEST_PASSWORD}
STALWART_BASE_URL=http://localhost:8080
EOF

echo "Environment file created at $ENV_FILE"
echo "Setup complete! You can now run: mise :test:deno"
