import { createMessage } from "@upyo/core";
import { CloudflareTransport } from "./cloudflare-transport.ts";
import { createTestConfig, type TestConfig } from "./test-utils/test-config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

let config: TestConfig | undefined;
try {
  config = createTestConfig();
} catch {
  console.warn("Skipping E2E tests: missing Cloudflare configuration");
}

// Every send goes to CLOUDFLARE_TO only, so that a test never mails, or
// bounces from, an address nobody controls.
describe("CloudflareTransport E2E", { skip: config == null }, () => {
  it("sends a message with an attachment", async () => {
    const { from, to, ...transportConfig } = config!;
    const transport = new CloudflareTransport(transportConfig);
    const receipt = await transport.send(
      createMessage({
        from,
        to,
        subject: "Upyo Cloudflare E2E test",
        content: {
          text: "Hello from @upyo/cloudflare.",
          html: "<p>Hello!</p>",
        },
        attachments: [
          {
            filename: "hello.txt",
            content: new TextEncoder().encode("hello"),
            contentType: "text/plain",
            inline: false,
            contentId: "",
          },
        ],
      }),
    );
    assert.ok(receipt.successful, JSON.stringify(receipt));
    assert.notEqual(receipt.messageId, "");
  });

  it("sends with display names and an inline image", async () => {
    const { from, to, ...transportConfig } = config!;
    const transport = new CloudflareTransport(transportConfig);
    const receipt = await transport.send(
      createMessage({
        from: `"Upyo, E2E" <${from}>`,
        to: `Upyo Recipient <${to}>`,
        subject: "Upyo Cloudflare E2E test: names and inline image",
        content: { html: '<p>Logo: <img src="cid:logo"></p>', text: "Logo" },
        attachments: [
          {
            filename: "logo.png",
            // A 16×16 red square, so that a working inline image is visible.
            content: Uint8Array.from(
              atob(
                "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4o6ZGEmIY1TCqYfhqAAATqigQ9kvG0QAAAABJRU5ErkJggg==",
              ),
              (c) => c.charCodeAt(0),
            ),
            contentType: "image/png",
            inline: true,
            contentId: "logo",
          },
        ],
      }),
    );
    assert.ok(receipt.successful, JSON.stringify(receipt));
  });

  it("rejects a header Cloudflare controls before sending", async () => {
    const { from, to, ...transportConfig } = config!;
    const transport = new CloudflareTransport(transportConfig);
    const receipt = await transport.send(
      createMessage({
        from,
        to,
        subject: "Should not be sent",
        content: { text: "x" },
        headers: { "Message-ID": "<e2e@example.com>" },
      }),
    );
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "cloudflare.header_not_allowed");
  });

  it("reports an invalid token without retrying", async () => {
    const { from, to, ...transportConfig } = config!;
    const transport = new CloudflareTransport({
      ...transportConfig,
      apiToken: "invalid-token",
      retries: 0,
    });
    const receipt = await transport.send(
      createMessage({
        from,
        to,
        subject: "Should not be sent",
        content: { text: "x" },
      }),
    );
    assert.ok(!receipt.successful);
    assert.ok(!receipt.retryable, JSON.stringify(receipt));
    assert.match(receipt.errors?.[0].code ?? "", /^cloudflare\./);
  });
});
