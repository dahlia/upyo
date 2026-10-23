import type { CloudflareConfig } from "../config.ts";
import process from "node:process";

/**
 * Test configuration extending CloudflareConfig with E2E test options.
 */
export interface TestConfig extends CloudflareConfig {
  /**
   * Sender address on a domain onboarded to Cloudflare Email Sending.
   */
  readonly from: string;

  /**
   * Recipient address for E2E tests.
   */
  readonly to: string;
}

/**
 * Creates a test configuration from environment variables.
 *
 * @returns Test configuration for the Cloudflare transport.
 * @throws {Error} If required environment variables are not set.
 */
export function createTestConfig(): TestConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const from = process.env.CLOUDFLARE_FROM;
  const to = process.env.CLOUDFLARE_TO;

  if (!accountId || !apiToken || !from || !to) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_FROM, and " +
        "CLOUDFLARE_TO environment variables are required for E2E tests.",
    );
  }

  const baseUrl = process.env.CLOUDFLARE_BASE_URL;
  return {
    accountId,
    apiToken,
    from,
    to,
    ...(baseUrl && { baseUrl }),
    timeout: 30000,
    retries: 3,
  };
}
