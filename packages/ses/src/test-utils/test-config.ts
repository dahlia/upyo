import type { SesConfig } from "../config.ts";

export function createTestSesConfig(
  overrides: Partial<SesConfig> = {},
): SesConfig {
  return {
    authentication: {
      type: "credentials",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
    region: "us-east-1",
    timeout: 30000,
    retries: 0,
    ...overrides,
  };
}

export function createTestSessionConfig(
  overrides: Partial<SesConfig> = {},
): SesConfig {
  return {
    authentication: {
      type: "session",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      sessionToken: "example-session-token",
    },
    region: "us-east-1",
    timeout: 30000,
    retries: 0,
    ...overrides,
  };
}
