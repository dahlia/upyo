<script setup lang="ts">
import { withBase } from "vitepress";
import CodeBlock from "./CodeBlock.vue";

const receiptCode = `const receipt = await transport.send(message);

if (receipt.successful) {
  receipt.messageId;      // string, available only here
} else {
  receipt.errorMessages;  // string[], available only here
}`;

const features = [
  {
    label: "npm and JSR",
    desc: "Install from npm with the tools you already use, or from JSR for Deno. Both registries are first-class, not an afterthought.",
  },
  {
    label: "ESM and CommonJS",
    desc: "Every package ships both module formats with type declarations, so it works whether your project uses <code>import</code> or <code>require()</code>.",
  },
  {
    label: "TypeScript-first",
    desc: "Types live in the source, so there are no <code>@types</code> packages to add. Results come back as a discriminated union you can narrow safely.",
  },
  {
    label: "Zero dependencies",
    desc: "The core and transports lean on web-standard APIs instead of a dependency tree, so installs stay small and audits stay short.",
  },
];
</script>

<template>
  <section class="lp-section">
    <div class="lp-container">
      <div class="lp-split lp-split--reverse">
        <div class="lp-head lp-reveal">
          <p class="lp-eyebrow">Packaging</p>
          <h2 class="lp-heading">Modern from the build out</h2>
          <p class="lp-lead">
            Upyo is written in TypeScript and published the way you'd hope a
            library written today would be. The result is a package that drops
            cleanly into whatever toolchain you already have, and a sending
            result the compiler can check for you.
          </p>
        </div>
        <div class="lp-split__media lp-reveal">
          <CodeBlock file="receipt.ts" tag="Type-safe" :code="receiptCode" />
        </div>
      </div>

      <div class="lp-feature-grid lp-reveal">
        <div v-for="feature in features" :key="feature.label">
          <div class="lp-feature__label">{{ feature.label }}</div>
          <p class="lp-feature__desc" v-html="feature.desc"></p>
        </div>
      </div>

      <a class="lp-arrow lp-reveal" :href="withBase('/start')">
        Add Upyo to your project <span class="lp-arrow__i">→</span>
      </a>
    </div>
  </section>
</template>
