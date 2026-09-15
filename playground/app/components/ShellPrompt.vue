<script setup lang="ts">
defineProps<{
  cmd?: string
  idle?: boolean
  typing?: boolean
}>()
</script>

<template>
  <p class="shell-prompt">
    <span class="shell-prompt__arrow">➜</span>
    <span class="shell-prompt__cwd">nuxt-app</span>
    <span class="shell-prompt__git">git:(<span class="shell-prompt__branch">main</span>)</span>
    <span v-if="cmd" class="shell-prompt__cmd">{{ cmd }}</span>
    <span v-if="typing || idle" class="shell-prompt__cursor" aria-hidden="true">█</span>
  </p>
</template>
