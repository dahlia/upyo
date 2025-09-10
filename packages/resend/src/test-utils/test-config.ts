import type { ResendConfig } from "../config.ts";
import process from "node:process";

/**
 * Test configuration interface extending ResendConfig with test-specific options.
 */
export interface TestConfig extends ResendConfig {
  /**
   * Recipient email address for E2E tests.
   * If not provided, uses the account owner's email for unverified accounts.
   */
  readonly recipientEmail?: string;

  /**
   * Verified domain for sending emails.
   * If provided, enables full E2E testing with actual email sending.
   * Format: "example.com" (without @ symbol)
   */
  readonly verifiedDomain?: string;
}

/**
 * Creates a test configuration for Resend transport from environment variables.
 *
 * This function reads the Resend API key from environment variables and
 * creates a configuration suitable for testing purposes.
 *
 * @returns Test configuration for Resend transport
 * @throws Error if required environment variables are not set
 */
export function createTestConfig(): TestConfig {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY environment variable is required for E2E tests. " +
        "Please set it to your Resend API key.",
    );
  }

  const baseUrl = process.env.RESEND_BASE_URL;
  const recipientEmail = process.env.RESEND_TO;
  const verifiedDomain = process.env.RESEND_VERIFIED_DOMAIN;

  return {
    apiKey,
    ...(baseUrl && { baseUrl }),
    ...(recipientEmail && { recipientEmail }),
    ...(verifiedDomain && { verifiedDomain }),
    timeout: 30000,
    retries: 3,
  };
}
