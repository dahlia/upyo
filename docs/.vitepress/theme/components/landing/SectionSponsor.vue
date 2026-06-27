<script setup lang="ts">
import { withBase } from "vitepress";
</script>

<template>
  <section class="lp-section lp-sponsor">
    <div class="lp-container">
      <div class="lp-head lp-head--center lp-reveal">
        <p class="lp-eyebrow">Get started</p>
        <h2 class="lp-heading">Ready to send your first message?</h2>
        <p class="lp-lead">
          Add a package, copy one of the examples above, and you'll be sending
          email in a few minutes.
        </p>
        <div class="lp-actions" style="justify-content: center">
          <a class="lp-btn lp-btn--brand" :href="withBase('/start')">
            Get started
          </a>
          <a class="lp-btn lp-btn--alt" :href="withBase('/why')">
            Why Upyo?
          </a>
        </div>
      </div>

      <div class="lp-perf lp-sponsor__divider lp-reveal"></div>

      <p class="lp-sponsor__note lp-reveal">
        Upyo is free, open source, and maintained by
        <a
          class="lp-sponsor__link"
          href="https://hongminhee.org/"
          target="_blank"
          rel="noreferrer"
        >Hong Minhee</a>. If it saves you some time, you can support its
        continued development through
        <a
          class="lp-sponsor__link"
          href="https://github.com/sponsors/dahlia"
          target="_blank"
          rel="noreferrer"
        >GitHub Sponsors</a> <span class="lp-sponsor__heart">♥</span>. Thank you
        for considering it.
      </p>

      <p class="lp-coda lp-reveal">
        Upyo (郵票) is the Sino-Korean word for a postage stamp.
      </p>
    </div>
  </section>
</template>
