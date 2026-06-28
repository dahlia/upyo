import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SmtpTransport } from "./smtp-transport.ts";
import {
  createTestMessage,
  getOAuth2TestConfig,
  isOAuth2TestingEnabled,
} from "./test-utils/test-config.ts";

// These tests run against a real OAuth 2.0-enabled SMTP server (e.g. Gmail or
// Outlook).  They are skipped unless the SMTP_OAUTH2_* environment variables
// are configured.  See packages/smtp/README.md for the required variables and
// how to mint a token with google-auth-library / msal-node.
describe(
  "SmtpTransport OAuth 2.0 E2E",
  { skip: !isOAuth2TestingEnabled() },
  () => {
    if (!isOAuth2TestingEnabled()) return;

    test("sends a real message authenticated via OAuth 2.0", async () => {
      const { smtp, from, to } = getOAuth2TestConfig();
      const transport = new SmtpTransport(smtp);
      try {
        const receipt = await transport.send(
          createTestMessage({ senderEmail: from, recipientEmail: to }),
        );
        assert.ok(
          receipt.successful,
          receipt.successful ? undefined : receipt.errorMessages.join("; "),
        );
      } finally {
        await transport.closeAllConnections();
      }
    });

    test("reuses a cached token across multiple sends", async (t) => {
      const { smtp, from, to, usesRefreshFlow } = getOAuth2TestConfig();
      if (!usesRefreshFlow) {
        t.skip("requires refresh-token auth to exercise token caching");
        return;
      }
      const transport = new SmtpTransport(smtp);
      try {
        const first = await transport.send(
          createTestMessage({ senderEmail: from, recipientEmail: to }),
        );
        const second = await transport.send(
          createTestMessage({ senderEmail: from, recipientEmail: to }),
        );
        assert.ok(first.successful);
        assert.ok(second.successful);
      } finally {
        await transport.closeAllConnections();
      }
    });
  },
);
