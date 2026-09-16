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
  } catch {
    // error surfaced via `error`
  }
}
</script>

<template>
  <section class="shell-panel">
    <h2 class="shell-panel__title">
      {{ mode === 'signIn' ? 'sign-in' : 'create-account' }}
    </h2>
    <p class="shell-panel__meta">password auth via useAuth()</p>
    <form class="mt-4 grid gap-3" @submit.prevent="submit">
      <label class="shell-field">
        <span class="shell-field__label">email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="shell-input"
        />
      </label>
      <label class="shell-field">
        <span class="shell-field__label">password</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="current-password"
          class="shell-input"
        />
      </label>
      <p v-if="error" class="shell-err">
        {{ displayError(error) }}
      </p>
      <div class="shell-row">
        <button type="submit" class="shell-btn" :disabled="pending">
          {{ pending ? '…' : mode === 'signIn' ? 'sign in' : 'sign up' }}
        </button>
        <button
          type="button"
          class="shell-btn shell-btn--ghost"
          @click="mode = mode === 'signIn' ? 'signUp' : 'signIn'"
        >
          {{ mode === 'signIn' ? 'need an account?' : 'have an account?' }}
        </button>
      </div>
    </form>
  </section>
</template>
