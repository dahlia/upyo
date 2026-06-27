<script setup lang="ts">
import { withBase } from "vitepress";
import CodeBlock from "./CodeBlock.vue";

const swapCode = `// In development, talk to a local SMTP server:
const transport = new SmtpTransport({
  host: "localhost",
  port: 1025,
});

// In production, switch to a hosted API. Just this one
// line changes; everything below stays the same:
const transport = new SendGridTransport({
  apiKey: process.env.SENDGRID_KEY,
});

await transport.send(message);`;

const providers = [
  { name: "SMTP", desc: "Any SMTP server, with pooling and TLS.", link: "/transports/smtp" },
  { name: "JMAP", desc: "The modern JSON mail protocol.", link: "/transports/jmap" },
  { name: "Lettermint", desc: "Transactional API with batching.", link: "/transports/lettermint" },
  { name: "Mailgun", desc: "US and EU regions, analytics.", link: "/transports/mailgun" },
  { name: "Plunk", desc: "Cloud-hosted or self-hosted.", link: "/transports/plunk" },
  { name: "Resend", desc: "A developer-first email API.", link: "/transports/resend" },
  { name: "SendGrid", desc: "Templates and analytics at scale.", link: "/transports/sendgrid" },
  { name: "Amazon SES", desc: "AWS delivery with SigV4 auth.", link: "/transports/ses" },
];

const utilities = [
  { name: "Pool", desc: "Load-balance and fail over across transports.", link: "/transports/pool" },
  { name: "Mock", desc: "Capture messages in tests, send nothing.", link: "/transports/mock" },
  { name: "OpenTelemetry", desc: "Traces and metrics for any transport.", link: "/transports/opentelemetry" },
  { name: "Custom", desc: "Build your own in a couple of methods.", link: "/transports/custom" },
];
</script>

<template>
  <section class="lp-section lp-section--paper">
    <div class="lp-container">
      <div class="lp-split">
        <div class="lp-head lp-reveal">
          <p class="lp-eyebrow">Transports</p>
          <h2 class="lp-heading">Switch providers without rewriting your app</h2>
          <p class="lp-lead">
            A transport is simply where your messages go. Upyo gives every
            provider the same interface, so moving from SMTP in development to a
            hosted API in production, or from one provider to another, is a
            one-line change. The code that builds your message never has to
            know the difference.
          </p>
        </div>
        <div class="lp-split__media lp-reveal">
          <CodeBlock file="transport.ts" :code="swapCode" />
        </div>
      </div>

      <div class="lp-tport-group lp-reveal">
        <p class="lp-tport-group__title">Providers</p>
        <div class="lp-tport-grid">
          <a
            v-for="t in providers"
            :key="t.name"
            class="lp-tport"
            :href="withBase(t.link)"
          >
            <span class="lp-tport__name">{{ t.name }}</span>
            <span class="lp-tport__desc">{{ t.desc }}</span>
          </a>
        </div>
      </div>

      <div class="lp-tport-group lp-reveal">
        <p class="lp-tport-group__title">Utility transports</p>
        <div class="lp-tport-grid">
          <a
            v-for="t in utilities"
            :key="t.name"
            class="lp-tport"
            :href="withBase(t.link)"
          >
            <span class="lp-tport__name">{{ t.name }}</span>
            <span class="lp-tport__desc">{{ t.desc }}</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
