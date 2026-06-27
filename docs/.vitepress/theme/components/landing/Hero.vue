<script setup lang="ts">
import { withBase } from "vitepress";
import HeroCode from "./HeroCode.vue";
import BrandIcon from "./BrandIcon.vue";
</script>

<template>
  <section class="lp-section lp-hero">
    <div class="lp-container">
      <div class="lp-hero__grid">
        <div class="lp-hero__intro lp-reveal">
          <img
            class="lp-hero__logo"
            :src="withBase('/logo.svg')"
            alt="Upyo logo"
            width="60"
            height="60"
          />
          <p class="lp-eyebrow">Cross-runtime email library</p>
          <h1 class="lp-hero__name">
            Upyo<span class="lp-hero__phon">/up<sup>h</sup>jo/</span>
          </h1>
          <p class="lp-hero__tagline">
            Send email from anywhere your code runs.
          </p>
          <p class="lp-hero__lead">
            Upyo is a small email library for JavaScript and TypeScript. You
            write a message once, choose a transport, and send. The same code
            works on Node.js, Deno, Bun, and edge functions, with whichever
            provider you prefer.
          </p>
          <div class="lp-actions">
            <a class="lp-btn lp-btn--brand" :href="withBase('/start')">
              Get started
            </a>
            <a class="lp-btn lp-btn--alt" :href="withBase('/why')">
              Why Upyo?
            </a>
            <a
              class="lp-btn lp-btn--alt"
              href="https://github.com/dahlia/upyo"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>

        <div class="lp-hero__media lp-reveal">
          <div class="lp-stamp">
            <div class="lp-stamp__inner">
              <HeroCode />
            </div>
          </div>
        </div>
      </div>

      <div class="lp-runtimes lp-reveal">
        <span class="lp-runtimes__label">Runs on</span>
        <span class="lp-runtimes__list">
          <span class="lp-rt"><BrandIcon name="nodedotjs" />Node.js</span>
          <span class="lp-rt"><BrandIcon name="deno" />Deno</span>
          <span class="lp-rt"><BrandIcon name="bun" />Bun</span>
          <span class="lp-rt">
            Edge functions
            <span class="lp-rt__providers">
              <BrandIcon name="cloudflareworkers" title="Cloudflare Workers" />
              <BrandIcon name="vercel" title="Vercel" />
              <BrandIcon name="netlify" title="Netlify" />
            </span>
          </span>
        </span>
      </div>
    </div>
  </section>
</template>
