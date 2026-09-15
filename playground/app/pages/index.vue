<script setup lang="ts">
import { useHead } from 'nuxt/app'
import featuresMd from '~~/features.md?raw'
import { highlightMdLines } from '../utils/highlightMd'

useHead({
  title: 'use-convex',
  htmlAttrs: {
    class: 'shell-html',
  },
})

const composables = [
  {
    name: 'useConvexQuery',
    kind: 'query',
    flags: 'ssr live skip auth',
    example: `const { data, pending, error } = await useConvexQuery(
  api.tasks.list,
  {}, // args | 'skip' | getter
)`,
  },
  {
    name: 'useConvexQueries',
    kind: 'query',
    flags: 'batch skip',
    example: `const results = useConvexQueries(() => ({
  inbox: { query: api.messages.list, args: { channel: 'inbox' } },
  later: id.value ? { query: api.messages.get, args: { id: id.value } } : 'skip',
}))`,
  },
  {
    name: 'useConvexPaginatedQuery',
    kind: 'query',
    flags: 'ssr live',
    example: `const { results, status, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 20 },
)`,
  },
  {
    name: 'useConvexMutation',
    kind: 'mutation',
    flags: 'optimistic',
    example: `const { mutate } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => { /* patch local query */ },
})
await mutate({ text: 'Ship it' })`,
  },
  {
    name: 'useConvexAction',
    kind: 'action',
    flags: '',
    example: `const { run } = useConvexAction(api.ai.summarize)
await run({ text: '…' })`,
  },
  {
    name: 'useConvexFileUpload',
    kind: 'storage',
    flags: 'progress',
    example: `const { upload, progress } = useConvexFileUpload({
  generateUploadUrl: api.files.generateUploadUrl,
  saveFile: api.files.save,
})
await upload(file)`,
  },
  {
    name: 'useConvexR2Upload',
    kind: 'storage',
    flags: 'r2',
    example: `const { upload } = useConvexR2Upload(api.r2)
const key = await upload(file)`,
  },
  {
    name: 'useAuth',
    kind: 'auth',
    flags: 'cookie httpOnly',
    example: `const { signIn, signOut } = useAuth()
await signIn('password', { email, password, flow: 'signIn' })`,
  },
  {
    name: 'fetchQuery',
    kind: 'nitro',
    flags: 'server',
    example: `requireConvexAuth(event)
return await fetchQuery(api.tasks.list, {}, { event })`,
  },
  {
    name: 'fetchMutation',
    kind: 'nitro',
    flags: 'server',
    example: `return await fetchMutation(api.tasks.create, { text }, { event })`,
  },
  {
    name: 'fetchAction',
    kind: 'nitro',
    flags: 'server',
    example: `return await fetchAction(api.tasks.shout, { text }, { event })`,
  },
] as const

const featureLines = computed(() => highlightMdLines(featuresMd))

const FEATURES_CMD = 'cat features.md'
const COMPOSABLES_CMD = 'cat -n composables/*'
const NPM_CMD = 'npm i use-convex convex'

const typedFeatures = ref('')
const typedComposables = ref('')
const typedNpm = ref('')
const showFeatures = ref(false)
const snippetCount = ref(0)
const showNpm = ref(false)
const showIdle = ref(false)
const typing = ref<'features' | 'composables' | 'npm' | null>('features')

const CHAR_MS = 40
const BEFORE_TYPE_MS = 1000
const AFTER_CMD_MS = 220
const SNIPPET_MS = 80

let cancelled = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function typeCommand(full: string, target: typeof typedFeatures): Promise<void> {
  target.value = ''
  for (const char of full) {
    if (cancelled) {
      return
    }
    target.value += char
    await sleep(CHAR_MS)
  }
}

function finishImmediately(): void {
  typedFeatures.value = FEATURES_CMD
  typedComposables.value = COMPOSABLES_CMD
  typedNpm.value = NPM_CMD
  showFeatures.value = true
  snippetCount.value = composables.length
  showNpm.value = true
  showIdle.value = true
  typing.value = null
}

async function play(): Promise<void> {
  typing.value = 'features'
  await sleep(BEFORE_TYPE_MS)
  await typeCommand(FEATURES_CMD, typedFeatures)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(AFTER_CMD_MS)
  showFeatures.value = true
  typing.value = 'composables'
  await sleep(BEFORE_TYPE_MS)
  await typeCommand(COMPOSABLES_CMD, typedComposables)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(AFTER_CMD_MS)
  for (let i = 1; i <= composables.length; i++) {
    if (cancelled) {
      return
    }
    snippetCount.value = i
    await sleep(SNIPPET_MS)
  }

  typing.value = 'npm'
  await sleep(BEFORE_TYPE_MS)
  await typeCommand(NPM_CMD, typedNpm)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(AFTER_CMD_MS)
  showNpm.value = true
  showIdle.value = true
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishImmediately()
    return
  }
  void play()
})

onUnmounted(() => {
  cancelled = true
})
</script>

<template>
  <main class="shell">
    <div class="shell-inner">
      <ShellPrompt :cmd="typedFeatures" :typing="typing === 'features'" />
      <pre v-if="showFeatures" class="shell-md shell-boot-in"
        ><span
          v-for="(html, i) in featureLines"
          :key="i"
          class="shell-md__line"
          v-html="html || '&nbsp;'"
      /></pre>

      <template v-if="typedComposables || typing === 'composables'">
        <ShellPrompt :cmd="typedComposables" :typing="typing === 'composables'" />
        <ShellSnippet
          v-for="item in composables.slice(0, snippetCount)"
          :key="item.name"
          class="shell-boot-in"
          :name="item.name"
          :kind="item.kind"
          :flags="item.flags"
          :code="item.example"
        />
      </template>

      <template v-if="typedNpm || typing === 'npm'">
        <ShellPrompt :cmd="typedNpm" :typing="typing === 'npm'" />
        <div v-if="showNpm" class="shell-npm shell-boot-in">
          <p><span class="shell-ok">+</span> use-convex</p>
          <p><span class="shell-ok">+</span> convex</p>
          <p class="shell-npm__meta">
            <a href="https://www.npmjs.com/package/use-convex" target="_blank" rel="noreferrer"
              >npmjs.com/package/use-convex</a
            >
          </p>
          <p class="shell-npm__meta">
            <a href="https://github.com/jrmybtlr/convex-nuxt" target="_blank" rel="noreferrer"
              >github.com/jrmybtlr/convex-nuxt</a
            >
          </p>
        </div>
      </template>

      <ShellPrompt v-if="showIdle" idle />
    </div>
  </main>
</template>
