<script setup lang="ts">
import { withBase } from "vitepress";
import CodeBlock from "./CodeBlock.vue";

const mockCode = `const transport = new MockTransport();
await transport.send(message);

const sent = transport.getSentMessages();
sent[0].subject;                // "Hello from Upyo!"
sent[0].recipients[0].address;  // "rachel@example.net"`;

const otelCode = `const transport = createOpenTelemetryTransport(base, {
  serviceName: "email-service",
  metrics: { enabled: true },
  tracing: { enabled: true },
});

// your sending code stays the same
await transport.send(message);`;
</script>

<template>
  <section class="lp-section lp-section--paper">
    <div class="lp-container">
      <div class="lp-head lp-reveal">
        <p class="lp-eyebrow">Testing &amp; telemetry</p>
        <h2 class="lp-heading">Built to be developed against</h2>
        <p class="lp-lead">
          Two small things make day-to-day work easier: a mock transport for
          your tests, and OpenTelemetry for when you need to see what's
          happening in production. Both implement the same interface as every
          other transport, so they slot in without touching your sending code.
        </p>
      </div>

      <div class="lp-duo lp-reveal">
        <div class="lp-duo__col">
          <h3 class="lp-duo__title">Test without sending real email</h3>
          <p class="lp-duo__desc">
            The mock transport keeps every message in memory so your tests can
            inspect exactly what would have been sent: recipients, subject,
            attachments, and all.
          </p>
          <CodeBlock file="mock.test.ts" :code="mockCode" />
          <a class="lp-arrow" :href="withBase('/transports/mock')">
            Mock transport <span class="lp-arrow__i">→</span>
          </a>
        </div>

        <div class="lp-duo__col">
          <h3 class="lp-duo__title">See what's happening in production</h3>
          <p class="lp-duo__desc">
            Wrap any transport to get traces and metrics like delivery rates,
            latency, and error classification, with nothing to change in the
            code that actually sends.
          </p>
          <CodeBlock file="observe.ts" :code="otelCode" />
          <a class="lp-arrow" :href="withBase('/transports/opentelemetry')">
            OpenTelemetry transport <span class="lp-arrow__i">→</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
