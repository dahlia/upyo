import { createMessage } from "@upyo/core";
import { SesTransport } from "@upyo/ses";
import assert from "node:assert/strict";
import { test } from "node:test";

test("SesTransport sendMany handles concurrent sending", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  try {
    globalThis.fetch = () => {
      fetchCallCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ MessageId: `test-id-${fetchCallCount}` }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    };

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      region: "us-east-1",
      batchSize: 2,
    });

    const messages = [
      createMessage({
        from: "sender@example.com",
        to: "recipient1@example.com",
        subject: "Test Subject 1",
        content: { text: "Hello World 1!" },
      }),
      createMessage({
        from: "sender@example.com",
        to: "recipient2@example.com",
        subject: "Test Subject 2",
        content: { text: "Hello World 2!" },
      }),
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    assert.equal(fetchCallCount, 2);

    for (const receipt of receipts) {
      assert.ok(receipt.successful);
      if (receipt.successful) {
        assert.ok(receipt.messageId.startsWith("test-id-"));
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SesTransport sendMany respects batchSize", async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: number[] = [];

  try {
    globalThis.fetch = () => {
      fetchCalls.push(Date.now());
      return Promise.resolve(
        new Response(
          JSON.stringify({ MessageId: `test-id-${fetchCalls.length}` }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    };

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      region: "us-east-1",
      batchSize: 2,
    });

    const messages = Array(5).fill(null).map((_, i) =>
      createMessage({
        from: "sender@example.com",
        to: `recipient${i}@example.com`,
        subject: `Test Subject ${i}`,
        content: { text: `Hello World ${i}!` },
      })
    );

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 5);
    assert.equal(fetchCalls.length, 5);

    // Check that first 2 calls happened roughly at the same time (concurrent)
    // and next 2 calls happened roughly at the same time
    // and last call happened separately
    const timeDiff1 = Math.abs(fetchCalls[1] - fetchCalls[0]);
    const timeDiff2 = Math.abs(fetchCalls[3] - fetchCalls[2]);

    // Concurrent calls should happen within 50ms of each other
    assert.ok(
      timeDiff1 < 50,
      `First batch calls should be concurrent, but diff was ${timeDiff1}ms`,
    );
    assert.ok(
      timeDiff2 < 50,
      `Second batch calls should be concurrent, but diff was ${timeDiff2}ms`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SesTransport sendMany handles errors in concurrent sending", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  try {
    globalThis.fetch = () => {
      fetchCallCount++;
      if (fetchCallCount === 2) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ MessageId: `test-id-${fetchCallCount}` }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    };

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      region: "us-east-1",
      batchSize: 2,
      retries: 0, // Disable retries for predictable test behavior
    });

    const messages = [
      createMessage({
        from: "sender@example.com",
        to: "recipient1@example.com",
        subject: "Test Subject 1",
        content: { text: "Hello World 1!" },
      }),
      createMessage({
        from: "sender@example.com",
        to: "recipient2@example.com",
        subject: "Test Subject 2",
        content: { text: "Hello World 2!" },
      }),
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    assert.equal(fetchCallCount, 2);

    assert.ok(receipts[0].successful);
    assert.ok(!receipts[1].successful);

    if (!receipts[1].successful) {
      assert.ok(receipts[1].errorMessages.includes("Network error"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
