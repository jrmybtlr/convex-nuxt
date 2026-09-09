<script setup lang="ts">
const {
  error,
  pending,
  signInWithPassword,
} = usePlaygroundAuth()

const email = ref('')
const password = ref('')
const mode = ref<'signIn' | 'signUp'>('signIn')

async function submit() {
  try {
    await signInWithPassword(
      email.value.trim(),
      password.value,
      mode.value,
    )
  }
  catch {
    // error surfaced via `error`
  }
}
</script>

<template>
  <section style="margin: 1.5rem 0; padding: 1.25rem; border: 1px solid #ddd; border-radius: 8px">
    <h2 style="margin: 0 0 0.75rem; font-size: 1.1rem">
      {{ mode === 'signIn' ? 'Sign in' : 'Create account' }}
    </h2>
    <form
      style="display: grid; gap: 0.75rem"
      @submit.prevent="submit"
    >
      <label style="display: grid; gap: 0.25rem">
        <span>Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          style="padding: 0.5rem"
        >
      </label>
      <label style="display: grid; gap: 0.25rem">
        <span>Password</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="current-password"
          style="padding: 0.5rem"
        >
      </label>
      <p
        v-if="error"
        style="color: #b00020; margin: 0"
      >
        {{ error }}
      </p>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
        <button
          type="submit"
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
          @click="mode = mode === 'signIn' ? 'signUp' : 'signIn'"
        >
          {{ mode === 'signIn' ? 'Need an account?' : 'Have an account?' }}
        </button>
      </div>
    </form>
  </section>
</template>
