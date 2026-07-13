<script setup lang="ts">
import { withBase } from "vitepress";
import CodeBlock from "./CodeBlock.vue";

const mockCode = `const transport = new MockTransport();
await transport.send(message);

const sent = transport.getSentMessages();
sent[0].subject;                // "Hello from Upyo!"
sent[0].recipients[0].address;  // "rachel@example.net"`;

const observabilityCode = `const traced = createOpenTelemetryTransport(base, {
  serviceName: "email-service",
  metrics: { enabled: true },
  tracing: { enabled: true },
});

const transport = new LogTapeTransport({
  transport: traced,
  category: ["app", "email"],
});

// your sending code stays the same
await transport.send(message);`;
</script>

<template>
  <section class="lp-section lp-section--paper">
    <div class="lp-container">
      <div class="lp-head lp-reveal">
        <p class="lp-eyebrow">Testing &amp; observability</p>
        <h2 class="lp-heading">Built to be developed against</h2>
        <p class="lp-lead">
          Mock email workflows without sending, record structured lifecycle
          logs with LogTape, and trace production delivery with OpenTelemetry.
          Each uses the same interface as every other transport, so they slot
          in without touching your sending code.
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
          <h3 class="lp-duo__title">Observe every delivery</h3>
          <p class="lp-duo__desc">
            Use LogTape for structured delivery logs, or wrap the same
            transport with OpenTelemetry for traces and metrics. Stack them
            when you want both views without changing the code that sends.
          </p>
          <CodeBlock file="observe.ts" :code="observabilityCode" />
          <div class="lp-duo__links">
            <a class="lp-arrow" :href="withBase('/transports/logtape')">
              LogTape transport <span class="lp-arrow__i">→</span>
            </a>
            <a class="lp-arrow" :href="withBase('/transports/opentelemetry')">
              OpenTelemetry transport <span class="lp-arrow__i">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
