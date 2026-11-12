<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const username = ref('')
const password = ref('')
const mode = ref<'signIn' | 'signUp'>('signUp')
const error = ref<string | null>(null)

// Each Convex Auth v2 method exports its own typed sign-in functions. In SSR
// mode they run through the Nitro auth proxy (listed in `convex.auth.signIn`).
const { run: signIn, pending: signingIn } = useConvexSignIn(api.auth.signInWithUsernamePassword)
const { run: signUp, pending: signingUp } = useConvexSignIn(api.auth.signUpWithUsernamePassword)
const pending = computed(() => signingIn.value || signingUp.value)

function describe(userError: { error: string; [key: string]: unknown }): string {
  switch (userError.error) {
    case 'INVALID_CREDENTIALS':
    case 'USER_NOT_FOUND':
      return 'Invalid username or password. If this is a new account, use Create account.'
    case 'USERNAME_TAKEN':
      return 'That username is taken.'
    case 'USERNAME_TOO_SHORT':
    case 'USERNAME_TOO_LONG':
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return 'Usernames are letters, numbers, and underscores.'
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common.'
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${userError.minimumLength} characters.`
    case 'RATE_LIMITED':
      return 'Too many attempts. Try again shortly.'
    case 'OTHER_ERROR':
      return userError.cause instanceof Error ? userError.cause.message : 'Something went wrong.'
    default:
      return userError.error
  }
}

async function submit() {
  error.value = null
  const credentials = { username: username.value.trim(), password: password.value }
  const result = mode.value === 'signIn' ? await signIn(credentials) : await signUp(credentials)
  if (result.status === 'error') {
    error.value = describe(result.userError as { error: string })
  }
}
</script>

<template>
  <section class="mt-8 rounded-lg border border-zinc-200 p-4">
    <h2 class="text-sm font-medium">
      {{ mode === 'signIn' ? 'Sign in' : 'Create account' }}
    </h2>
    <form class="mt-4 grid gap-3" @submit.prevent="submit">
      <label class="grid gap-1 text-sm">
        <span class="text-zinc-500">Username</span>
        <input
          id="username"
          v-model="username"
          name="username"
          type="text"
          required
          autocomplete="username"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        />
      </label>
      <label class="grid gap-1 text-sm">
        <span class="text-zinc-500">Password</span>
        <input
          id="password"
          v-model="password"
          name="password"
          type="password"
          required
          minlength="8"
          :autocomplete="mode === 'signIn' ? 'current-password' : 'new-password'"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        />
      </label>
      <p v-if="error" class="text-sm text-red-700">
        {{ error }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="rounded-md border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50"
          :disabled="pending"
        >
          {{ pending ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Sign up' }}
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
