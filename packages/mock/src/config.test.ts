import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createMockConfig, type MockConfig } from "./config.ts";

describe("createMockConfig", () => {
  test("should apply default values for empty config", () => {
    const config = createMockConfig();

    assert.deepEqual(config.defaultResponse, {
      successful: true,
      messageId: "mock-message-id",
    });
    assert.equal(config.delay, 0);
    assert.deepEqual(config.randomDelayRange, { min: 0, max: 0 });
    assert.equal(config.failureRate, 0);
    assert.equal(config.generateUniqueMessageIds, true);
  });

  test("should preserve provided values", () => {
    const inputConfig: MockConfig = {
      defaultResponse: {
        successful: false,
        errorMessages: ["Test error"],
      },
      delay: 100,
      randomDelayRange: { min: 50, max: 150 },
      failureRate: 0.1,
      generateUniqueMessageIds: false,
    };

    const config = createMockConfig(inputConfig);

    assert.deepEqual(config.defaultResponse, {
      successful: false,
      errorMessages: ["Test error"],
    });
    assert.equal(config.delay, 100);
    assert.deepEqual(config.randomDelayRange, { min: 50, max: 150 });
    assert.equal(config.failureRate, 0.1);
    assert.equal(config.generateUniqueMessageIds, false);
  });

  test("should apply defaults only to undefined fields", () => {
    const inputConfig: MockConfig = {
      delay: 50,
      failureRate: 0.05,
    };

    const config = createMockConfig(inputConfig);

    assert.deepEqual(config.defaultResponse, {
      successful: true,
      messageId: "mock-message-id",
    });
    assert.equal(config.delay, 50);
    assert.deepEqual(config.randomDelayRange, { min: 0, max: 0 });
    assert.equal(config.failureRate, 0.05);
    assert.equal(config.generateUniqueMessageIds, true);
  });

  test("should handle successful response configuration", () => {
    const inputConfig: MockConfig = {
      defaultResponse: {
        successful: true,
        messageId: "custom-message-id",
      },
    };

    const config = createMockConfig(inputConfig);

    assert.deepEqual(config.defaultResponse, {
      successful: true,
      messageId: "custom-message-id",
    });
  });

  test("should handle failed response configuration", () => {
    const inputConfig: MockConfig = {
      defaultResponse: {
        successful: false,
        errorMessages: ["Network error", "Timeout"],
      },
    };

    const config = createMockConfig(inputConfig);

    assert.deepEqual(config.defaultResponse, {
      successful: false,
      errorMessages: ["Network error", "Timeout"],
    });
  });
});
