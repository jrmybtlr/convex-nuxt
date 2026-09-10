<script setup lang="ts">
const { error, pending, signIn } = useAuth()

const email = ref('')
const password = ref('')
const mode = ref<'signIn' | 'signUp'>('signUp')

function displayError(message: string | null): string | null {
  if (!message) {
    return null
  }
  if (message.includes('InvalidSecret') || message.includes('InvalidAccountId')) {
    return 'Invalid email or password. If this is a new account, use Create account.'
  }
  return message
}

async function submit() {
  try {
    await signIn('password', {
      email: email.value.trim(),
      password: password.value,
      flow: mode.value,
    })
  }
  catch {
    // error surfaced via `error`
  }
}
</script>

<template>
  <section class="mt-8 rounded-lg border border-zinc-200 p-4">
    <h2 class="text-sm font-medium">
      {{ mode === 'signIn' ? 'Sign in' : 'Create account' }}
    </h2>
    <form
      class="mt-4 grid gap-3"
      @submit.prevent="submit"
    >
      <label class="grid gap-1 text-sm">
        <span class="text-zinc-500">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        >
      </label>
      <label class="grid gap-1 text-sm">
        <span class="text-zinc-500">Password</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="current-password"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        >
      </label>
      <p
        v-if="error"
        class="text-sm text-red-700"
      >
        {{ displayError(error) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="pending"
        >
          {{
            pending
              ? 'Working…'
              : mode === 'signIn'
                ? 'Sign in'
                : 'Sign up'
          }}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900"
          @click="mode = mode === 'signIn' ? 'signUp' : 'signIn'"
        >
          {{ mode === 'signIn' ? 'Need an account?' : 'Have an account?' }}
        </button>
      </div>
    </form>
  </section>
</template>
