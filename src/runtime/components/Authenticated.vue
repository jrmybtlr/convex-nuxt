<script setup lang="ts">
/**
 * Renders the default slot when `showAuthedUi` is true
 * (`isAuthenticated || hasSsrSession`).
 */
import { useConvexAuth } from '../composables/useConvexAuth'

const { showAuthedUi } = useConvexAuth()
</script>

<template>
  <slot v-if="showAuthedUi" />
</template>
