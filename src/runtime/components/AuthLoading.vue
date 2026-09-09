<script setup lang="ts">
/**
 * Renders while auth is resolving and the authed shell is not yet shown.
 */
import { useConvexAuth } from '../composables/useConvexAuth'

const { isLoading, showAuthedUi } = useConvexAuth()
</script>

<template>
  <slot v-if="isLoading && !showAuthedUi" />
</template>
