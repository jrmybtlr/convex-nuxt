<script setup lang="ts">
const { toast, toastKey } = useToast()
</script>

<template>
  <div class="min-h-dvh bg-white text-zinc-800 antialiased">
    <div class="mx-auto max-w-xl px-4">
      <nav class="flex gap-4 pt-8 text-sm">
        <NuxtLink
          to="/"
          class="text-zinc-400 aria-[current=page]:text-zinc-900 hover:text-zinc-900"
        >
          Live
        </NuxtLink>
        <NuxtLink
          to="/server"
          class="text-zinc-400 aria-[current=page]:text-zinc-900 hover:text-zinc-900"
        >
          Server routes
        </NuxtLink>
        <NuxtLink
          to="/extras"
          class="text-zinc-400 aria-[current=page]:text-zinc-900 hover:text-zinc-900"
        >
          Extras
        </NuxtLink>
      </nav>
      <NuxtPage />
    </div>

    <Transition name="toast">
      <p
        v-if="toast"
        :key="toastKey"
        data-testid="shout-toast"
        class="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg"
      >
        {{ toast }}
      </p>
    </Transition>
  </div>
</template>
