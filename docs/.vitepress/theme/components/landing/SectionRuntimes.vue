<script setup lang="ts">
import { withBase } from "vitepress";
import BrandIcon from "./BrandIcon.vue";

const runtimes = [
  {
    name: "Node.js",
    icons: ["nodedotjs"],
    desc: "The familiar default, with SMTP and every HTTP provider.",
  },
  {
    name: "Deno",
    icons: ["deno"],
    desc: "Install straight from JSR, with no build step required.",
  },
  {
    name: "Bun",
    icons: ["bun"],
    desc: "Runs on Bun's fast runtime without any shims.",
  },
  {
    name: "Edge functions",
    icons: ["cloudflareworkers", "vercel", "netlify"],
    desc: "Cloudflare Workers, Vercel, Netlify, Deno Deploy, and the like.",
  },
];

const iconTitles: Record<string, string> = {
  cloudflareworkers: "Cloudflare Workers",
};
</script>

<template>
  <section class="lp-section">
    <div class="lp-container">
      <div class="lp-head lp-reveal">
        <p class="lp-eyebrow">Runtimes</p>
        <h2 class="lp-heading">One API, every runtime</h2>
        <p class="lp-lead">
          Most email libraries quietly assume Node.js. Upyo doesn't. It builds
          on web-standard APIs like <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch"
            target="_blank" rel="noreferrer"><code>fetch()</code></a>, <a
            href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array"
            target="_blank" rel="noreferrer"><code>Uint8Array</code></a>, <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/File"
            target="_blank" rel="noreferrer"><code>File</code></a>, and <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal"
            target="_blank" rel="noreferrer"><code>AbortSignal</code></a>, so the
          same code runs unchanged across runtimes. You can develop against a
          local server and deploy to an edge function without rewriting
          anything.
        </p>
      </div>

      <div class="lp-runtile-grid lp-reveal">
        <div v-for="runtime in runtimes" :key="runtime.name" class="lp-runtile">
          <div class="lp-runtile__icos">
            <BrandIcon
              v-for="ic in runtime.icons"
              :key="ic"
              :name="ic"
              :title="iconTitles[ic]"
            />
          </div>
          <div class="lp-runtile__name">{{ runtime.name }}</div>
          <p class="lp-runtile__desc">{{ runtime.desc }}</p>
        </div>
      </div>

      <a class="lp-arrow lp-reveal" :href="withBase('/why')">
        Read why Upyo exists <span class="lp-arrow__i">→</span>
      </a>
    </div>
  </section>
</template>
