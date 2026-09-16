<script setup lang="ts">
useHead({
  htmlAttrs: {
    class: 'shell-html',
  },
})

const route = useRoute()
const { toast, toastKey } = useToast()
const isHome = computed(() => route.path === '/')

const links = [
  { to: '/', label: '~' },
  { to: '/live', label: 'live' },
  { to: '/server', label: 'server' },
  { to: '/files', label: 'files' },
  { to: '/extras', label: 'extras' },
] as const
</script>

<template>
  <div class="shell">
    <div class="shell-inner">
      <nav v-if="!isHome" class="shell-nav" aria-label="Demos">
        <span class="shell-nav__arrow" aria-hidden="true">➜</span>
        <span class="shell-nav__cwd">demos</span>
        <span class="shell-nav__sep" aria-hidden="true">·</span>
        <NuxtLink v-for="link in links" :key="link.to" :to="link.to">
          {{ link.label }}
        </NuxtLink>
      </nav>
      <NuxtPage />
    </div>

    <Transition name="toast">
      <p v-if="toast" :key="toastKey" data-testid="shout-toast" class="shell-toast">
        {{ toast }}
      </p>
    </Transition>
  </div>
</template>
