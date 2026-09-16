<script setup lang="ts">
defineProps<{
  cmd?: string
  idle?: boolean
  typing?: boolean
  interactive?: boolean
}>()

const draft = defineModel<string>({ default: '' })
const emit = defineEmits<{
  submit: []
}>()

const input = ref<HTMLInputElement | null>(null)

defineExpose({
  focus: () => {
    input.value?.focus()
    input.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
})
</script>

<template>
  <component :is="interactive ? 'form' : 'p'" class="shell-prompt" @submit.prevent="emit('submit')">
    <span class="shell-prompt__arrow">➜</span>
    <span class="shell-prompt__cwd">nuxt-app</span>
    <span class="shell-prompt__git">git:(<span class="shell-prompt__branch">main</span>)</span>
    <span v-if="cmd" class="shell-prompt__cmd">{{ cmd }}</span>
    <input
      v-if="interactive"
      ref="input"
      v-model="draft"
      class="shell-prompt__input"
      type="text"
      name="cmd"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="Command"
    />
    <span v-else-if="typing || idle" class="shell-prompt__cursor" aria-hidden="true" />
  </component>
</template>
