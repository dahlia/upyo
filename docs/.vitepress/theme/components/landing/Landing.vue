<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Hero from "./Hero.vue";
import SectionRuntimes from "./SectionRuntimes.vue";
import SectionTransports from "./SectionTransports.vue";
import SectionPackaging from "./SectionPackaging.vue";
import SectionDevExperience from "./SectionDevExperience.vue";
import SectionSponsor from "./SectionSponsor.vue";
import "./landing.css";

const root = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  const el = root.value;
  if (el == null) return;

  // Reveal-on-scroll is opt-in: the class only arms the hidden state once JS is
  // present, so the page is fully visible without scripting.
  el.classList.add("lp-js");

  if (typeof IntersectionObserver === "undefined") return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer?.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  for (const target of el.querySelectorAll(".lp-reveal")) {
    observer.observe(target);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="root" class="lp">
    <Hero />
    <SectionRuntimes />
    <SectionTransports />
    <SectionPackaging />
    <SectionDevExperience />
    <SectionSponsor />
  </div>
</template>
