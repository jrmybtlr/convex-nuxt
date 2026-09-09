<template>
  <div>
    <nav
      style="font-family: system-ui; max-width: 720px; margin: 1.5rem auto 0; padding: 0 1rem; display: flex; gap: 1rem"
    >
      <NuxtLink to="/">
        Live
      </NuxtLink>
      <NuxtLink to="/server">
        Server routes
      </NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>
