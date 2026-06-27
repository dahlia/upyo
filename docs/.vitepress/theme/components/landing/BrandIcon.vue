<script setup lang="ts">
import { computed } from "vue";
import { brandIcons } from "./icons";

const props = defineProps<{
  /** Simple Icons slug, e.g. "nodedotjs". */
  name: string;
  /** Accessible label override; defaults to the icon's brand name. */
  title?: string;
}>();

const icon = computed(() => brandIcons[props.name]);
const label = computed(() => props.title ?? icon.value?.title ?? props.name);
</script>

<template>
  <svg
    v-if="icon"
    class="lp-ico"
    viewBox="0 0 24 24"
    fill="currentColor"
    role="img"
    :aria-label="label"
  >
    <title>{{ label }}</title>
    <path :d="icon.path" />
  </svg>
</template>
