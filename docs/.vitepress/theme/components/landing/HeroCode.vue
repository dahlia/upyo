<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { highlightTs } from "./highlight";

// Only the transport changes between these; the message and the send call are
// identical for every one. Class names, packages, and config fields match the
// real @upyo/* transports.
const providers = [
  {
    label: "Mailgun",
    cls: "MailgunTransport",
    pkg: "mailgun",
    config: ["apiKey: process.env.MAILGUN_KEY,", "domain: process.env.MAILGUN_DOMAIN,"],
  },
  {
    label: "SendGrid",
    cls: "SendGridTransport",
    pkg: "sendgrid",
    config: ["apiKey: process.env.SENDGRID_KEY,"],
  },
  {
    label: "Maileroo",
    cls: "MailerooTransport",
    pkg: "maileroo",
    config: ["apiKey: process.env.MAILEROO_KEY,"],
  },
  {
    label: "Resend",
    cls: "ResendTransport",
    pkg: "resend",
    config: ["apiKey: process.env.RESEND_KEY,"],
  },
  {
    label: "Amazon SES",
    cls: "SesTransport",
    pkg: "ses",
    config: ["accessKeyId: process.env.AWS_KEY_ID,", "secretAccessKey: process.env.AWS_SECRET,"],
  },
  {
    label: "SMTP",
    cls: "SmtpTransport",
    pkg: "smtp",
    config: ['host: "smtp.example.com",', "port: 587,"],
  },
];

const idx = ref(0);
const provider = computed(() => providers[idx.value]);

const importHtml = computed(() =>
  highlightTs(`import { ${provider.value.cls} } from "@upyo/${provider.value.pkg}";`)
);
const transportHtml = computed(() =>
  highlightTs(
    `const transport = new ${provider.value.cls}({\n` +
      provider.value.config.map((c) => "  " + c).join("\n") +
      `\n});`
  )
);

// Static lines, highlighted once.
const headHtml = highlightTs(`import { createMessage } from "@upyo/core";`);
const messageHtml = highlightTs(
  `const message = createMessage({\n` +
    `  from: "hello@example.com",\n` +
    `  to: "rachel@example.net",\n` +
    `  subject: "Hello from Upyo!",\n` +
    `  content: { text: "This is a test email." },\n` +
    `});`
);
const sendHtml = highlightTs(`const receipt = await transport.send(message);`);

let timer: ReturnType<typeof setInterval> | undefined;
let allowed = false;

function tick() {
  idx.value = (idx.value + 1) % providers.length;
}
function start() {
  if (allowed && timer == null) timer = setInterval(tick, 2800);
}
function stop() {
  if (timer != null) {
    clearInterval(timer);
    timer = undefined;
  }
}

onMounted(() => {
  // Respect users who prefer not to see motion: show one transport, no cycling.
  allowed = !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  start();
});

onBeforeUnmount(stop);
</script>

<template>
  <div class="lp-codecard">
    <div class="lp-codecard__bar">
      <span class="lp-codecard__file">send.ts</span>
      <Transition name="fade" mode="out-in">
        <span class="lp-codecard__tag" :key="idx">{{ provider.label }}</span>
      </Transition>
    </div>
    <div class="lp-acode" @pointerenter="stop" @pointerleave="start">
      <div class="lp-aln" v-html="headHtml"></div>
      <div class="lp-aln lp-aln--swap">
        <Transition name="swap" mode="out-in">
          <span :key="idx" v-html="importHtml"></span>
        </Transition>
      </div>
      <div class="lp-aln lp-aln--blank"></div>
      <div class="lp-aln" v-html="messageHtml"></div>
      <div class="lp-aln lp-aln--blank"></div>
      <div class="lp-tblock">
        <Transition name="swap" mode="out-in">
          <div class="lp-tblock__in" :key="idx" v-html="transportHtml"></div>
        </Transition>
      </div>
      <div class="lp-aln lp-aln--blank"></div>
      <div class="lp-aln" v-html="sendHtml"></div>
    </div>
  </div>
</template>
