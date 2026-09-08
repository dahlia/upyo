import { createMessage, type Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailAttributeExtractor } from "./attributes.ts";
import { MetricsCollector } from "./metrics.ts";
import { createOpenTelemetryConfig } from "./config.ts";
import {
  MockMeterProvider,
  MockTracerProvider,
} from "./test-utils/mock-otel-providers.ts";

const CALENDAR_ICS = [
  "BEGIN:VCALENDAR",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:1@example.com",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

const base = {
  from: "organizer@example.com",
  to: "attendee@example.net",
  subject: "Lunch",
} as const;

const invitation = (content: Message["content"]): Message =>
  createMessage({
    ...base,
    content,
    calendar: { method: "REQUEST", content: CALENDAR_ICS },
  });

describe("content type detection", () => {
  const extractor = new EmailAttributeExtractor("test");
  const spanContentType = (message: Message) =>
    extractor.extractMessageAttributes(message)["email.content.type"];

  it("should report a message with no calendar as before", () => {
    assert.equal(
      spanContentType(createMessage({ ...base, content: { text: "Lunch." } })),
      "text",
    );
    assert.equal(
      spanContentType(
        createMessage({ ...base, content: { html: "<p>Lunch</p>" } }),
      ),
      "html",
    );
  });

  // A calendar is a second body part wherever it goes: an alternative on the
  // transports that compose one, a synthesized invite.ics attachment elsewhere.
  it("should report a calendar message as multipart on the span", () => {
    assert.equal(spanContentType(invitation({ text: "Lunch." })), "multipart");
    assert.equal(
      spanContentType(invitation({ html: "<p>Lunch</p>" })),
      "multipart",
    );
  });

  it("should label the size metric multipart for the same message", () => {
    const meterProvider = new MockMeterProvider();
    const config = createOpenTelemetryConfig({
      meterProvider,
      tracerProvider: new MockTracerProvider(),
      metrics: { enabled: true },
    });
    const collector = new MetricsCollector(meterProvider, config.metrics);

    collector.recordMessage(invitation({ text: "Lunch." }), "test");

    const labelled = meterProvider.meters
      .flatMap((meter) => meter.histograms)
      .flatMap((histogram) => histogram.records)
      .map((record) => record.attributes?.content_type)
      .filter((value) => value !== undefined);
    assert.ok(labelled.length > 0, "no histogram recorded a content type");
    for (const value of labelled) assert.equal(value, "multipart");
  });
});
