/**
 * Configuration interface for Mock transport.
 *
 * This interface defines options for configuring the mock transport's
 * behavior for testing scenarios.
 *
 * @example
 * ```typescript
 * const config: MockConfig = {
 *   defaultResponse: { successful: true, messageId: "test-123" },
 *   delay: 100,
 *   failureRate: 0.1
 * };
 * ```
 */
export interface MockConfig {
  /**
   * The default response to return for send operations.
   *
   * @default { successful: true, messageId: "mock-message-id" }
   */
  readonly defaultResponse?: {
    readonly successful: true;
    readonly messageId: string;
  } | {
    readonly successful: false;
    readonly errorMessages: readonly string[];
  };

  /**
   * Fixed delay in milliseconds for all send operations.
   *
   * @default 0
   */
  readonly delay?: number;

  /**
   * Random delay range in milliseconds for send operations.
   * When set, overrides the fixed delay setting.
   */
  readonly randomDelayRange?: {
    readonly min: number;
    readonly max: number;
  };

  /**
   * Failure rate (0.0 to 1.0) for random failures.
   * When set, sends will randomly fail at the specified rate.
   *
   * @default 0
   */
  readonly failureRate?: number;

  /**
   * Whether to automatically generate unique message IDs for successful responses.
   *
   * @default true
   */
  readonly generateUniqueMessageIds?: boolean;
}

/**
 * Resolved mock configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the mock transport implementation.
 */
export type ResolvedMockConfig = Required<MockConfig>;

/**
 * Creates a resolved mock configuration by applying default values to optional fields.
 *
 * This function takes a partial mock configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 *
 * @param config - The mock configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 *
 * @example
 * ```typescript
 * const resolved = createMockConfig({
 *   delay: 100
 * });
 *
 * // resolved.defaultResponse will be { successful: true, messageId: "mock-message-id" }
 * // resolved.failureRate will be 0 (default)
 * // resolved.generateUniqueMessageIds will be true (default)
 * ```
 */
export function createMockConfig(
  config: MockConfig = {},
): ResolvedMockConfig {
  return {
    defaultResponse: config.defaultResponse ?? {
      successful: true,
      messageId: "mock-message-id",
    },
    delay: config.delay ?? 0,
    randomDelayRange: config.randomDelayRange ?? { min: 0, max: 0 },
    failureRate: config.failureRate ?? 0,
    generateUniqueMessageIds: config.generateUniqueMessageIds ?? true,
  };
}
