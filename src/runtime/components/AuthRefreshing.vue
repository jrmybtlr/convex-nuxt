<script setup lang="ts">
/**
 * Renders while an authenticated session is refreshing a rejected token
 * (React `AuthRefreshing` parity). Routine background rotation does not
 * trigger this state.
 */
import { useConvexAuth } from '../composables/useConvexAuth'

const { isAuthenticated, isRefreshing } = useConvexAuth()
</script>

<template>
  <slot v-if="isAuthenticated && isRefreshing" />
</template>
