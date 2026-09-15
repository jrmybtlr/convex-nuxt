<script setup lang="ts">
const props = defineProps<{
  name: string
  kind: string
  flags?: string
  code: string
}>()

const lines = computed(() => highlightTsLines(props.code))

const meta = computed(() => {
  const parts = [props.kind, ...(props.flags ? props.flags.split(/\s+/).filter(Boolean) : [])]
  return parts.join(' / ')
})
</script>

<template>
  <article class="shell-snip">
    <p class="shell-snip__bar">
      <span class="shell-snip__name">{{ name }}</span>
      <span class="shell-snip__meta">( {{ meta }} )</span>
    </p>
    <div class="shell-snip__body">
      <div v-for="(html, i) in lines" :key="i" class="shell-snip__line">
        <span class="shell-snip__n">{{ String(i + 1).padStart(2, ' ') }}</span>
        <span class="shell-snip__pipe">│</span>
        <span class="shell-snip__code" v-html="html" />
      </div>
    </div>
  </article>
</template>
