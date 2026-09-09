<script setup lang="ts">
/**
 * Renders the default slot when there is no SSR session and Convex has not
 * confirmed auth (signed-out shell).
 */
import { useConvexAuth } from '../composables/useConvexAuth'

const { showAuthedUi, isLoading } = useConvexAuth()
</script>

<template>
  <slot v-if="!showAuthedUi && !isLoading" />
</template>
