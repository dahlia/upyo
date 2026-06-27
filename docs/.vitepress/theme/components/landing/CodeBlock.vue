<script setup lang="ts">
import { computed } from "vue";
import { highlightTs } from "./highlight";

const props = defineProps<{
  /** The source code to display. Leading/trailing blank lines are trimmed. */
  code: string;
  /** Filename shown on the panel bar, e.g. "send.ts". */
  file?: string;
  /** Small uppercase tag shown at the right of the panel bar. */
  tag?: string;
}>();

const html = computed(() => highlightTs(props.code.replace(/^\n+|\n+$/g, "")));
</script>

<template>
  <div class="lp-codecard">
    <div v-if="file || tag" class="lp-codecard__bar">
      <span class="lp-codecard__file">{{ file }}</span>
      <span v-if="tag" class="lp-codecard__tag">{{ tag }}</span>
    </div>
    <pre class="lp-code"><code v-html="html"></code></pre>
  </div>
</template>
