<script setup lang="ts">
import FilesDemo from '../components/FilesDemo.vue'

useHead({ title: 'Files · use-convex' })

const config = useRuntimeConfig()
const url = computed(() => (config.public.convex as { url?: string } | undefined)?.url)
</script>

<template>
  <main class="shell-page">
    <ShellPrompt cmd="./files --upload" />
    <h1 class="shell-page__title">File uploads</h1>
    <p class="shell-page__lead">
      Demo of <code>useConvexFileUpload</code>: generate an upload URL, POST the file, then save the
      <code>storageId</code>. For Cloudflare R2 / large objects, see
      <code>useConvexR2Upload</code> in the README. Sign in on
      <NuxtLink to="/live">Live</NuxtLink> first.
    </p>

    <p v-if="!url" class="shell-warn">
      Run <code>pnpm run dev:backend</code> to write the Convex URL into <code>.env.local</code>,
      then restart <code>pnpm run dev</code>.
    </p>
    <FilesDemo v-else />
  </main>
</template>
