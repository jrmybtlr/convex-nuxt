<script setup lang="ts">
import { useHead } from 'nuxt/app'
import featuresMd from '~~/features.md?raw'
import { highlightMdLines } from '../utils/highlightMd'

useHead({
  title: 'use-convex',
})

const composables = [
  {
    name: 'useConvexQuery',
    kind: 'query',
    flags: 'ssr live skip authenticated',
    example: `const { data, pending, error, refresh } = await useConvexQuery(
  api.tasks.list,
  {}, // args | 'skip' | getter
  { authenticated: true }, // wait for Convex auth before live
)`,
  },
  {
    name: 'useConvexQueries',
    kind: 'query',
    flags: 'batch skip browser',
    example: `// Browser-only live map (no SSR). Values: data | undefined | Error
const results = useConvexQueries(() => ({
  tasks: { query: api.tasks.list, args: {} },
  files: showFiles.value
    ? { query: api.files.list, args: {} }
    : 'skip',
}))
// results.value.tasks`,
  },
  {
    name: 'useConvexPaginatedQuery',
    kind: 'query',
    flags: 'ssr live authenticated',
    example: `const { results, status, isLoading, loadMore } = await useConvexPaginatedQuery(
  api.tasks.listPaginated,
  {},
  { initialNumItems: 20, authenticated: true },
)
// loadMore() when status === 'CanLoadMore'`,
  },
  {
    name: 'useConvexMutation',
    kind: 'mutation',
    flags: 'optimistic browser',
    example: `const { mutate, pending, error } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => {
    const existing = localStore.getQuery(api.tasks.list, {}) ?? []
    localStore.setQuery(api.tasks.list, {}, [
      { _id: 'tmp', text: args.text, completed: false },
      ...existing,
    ])
  },
})
await mutate({ text: 'Ship it' }) // browser-only`,
  },
  {
    name: 'useConvexAction',
    kind: 'action',
    flags: 'browser',
    example: `const { run, pending, error } = useConvexAction(api.tasks.shout)
const shouted = await run({ text: 'hello' }) // browser-only`,
  },
  {
    name: 'useConvexFileUpload',
    kind: 'storage',
    flags: 'progress browser',
    example: `const { upload, pending, error, progress } = useConvexFileUpload({
  generateUploadUrl: api.files.generateUploadUrl,
  saveFile: api.files.save, // must enforce auth
})
await upload(file) // progress: 0..1 while bytes fly`,
  },
  {
    name: 'useConvexR2Upload',
    kind: 'storage',
    flags: 'r2 browser',
    example: `// Pass r2.clientApi() exports: { generateUploadUrl, syncMetadata }
const { upload, pending, progress } = useConvexR2Upload(api.r2)
const key = await upload(file) // R2 object key`,
  },
  {
    name: 'useAuth',
    kind: 'auth',
    flags: 'convex-auth cookie httpOnly',
    example: `const { signIn, signOut, showAuthedUi, pending, error } = useAuth()
await signIn('password', { email, password, flow: 'signIn' })
// Gate UI with showAuthedUi; gate queries with { authenticated: true }`,
  },
  {
    name: 'prewarmQuery',
    kind: 'query',
    flags: 'browser',
    example: `// Warm a live subscription before a screen mounts
prewarmQuery(api.tasks.list, {})`,
  },
  {
    name: 'useConvexConnectionState',
    kind: 'client',
    flags: 'reactive',
    example: `const connection = useConvexConnectionState()
// connection.value?.isWebSocketConnected, .hasInflightRequests, …`,
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
    example: `requireConvexAuth(event)
return await fetchMutation(api.tasks.create, { text }, { event })`,
  },
  {
    name: 'fetchAction',
    kind: 'nitro',
    flags: 'server',
    example: `requireConvexAuth(event)
return await fetchAction(api.tasks.shout, { text }, { event })`,
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

let cancelled = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function jitter(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

function mistype(char: string): string {
  const neighbors: Record<string, string> = {
    a: 's',
    c: 'x',
    d: 's',
    e: 'w',
    i: 'u',
    l: 'k',
    m: 'n',
    n: 'b',
    o: 'p',
    p: 'o',
    s: 'a',
    t: 'r',
    u: 'y',
    v: 'c',
  }
  return neighbors[char] ?? (char === char.toLowerCase() ? 's' : 'S')
}

async function press(target: typeof typedFeatures, char: string): Promise<void> {
  target.value += char
  await nextTick()
  await sleep(jitter(22, 48))
}

async function backspace(target: typeof typedFeatures): Promise<void> {
  target.value = target.value.slice(0, -1)
  await nextTick()
  await sleep(jitter(70, 140))
}

async function typeCommand(full: string, target: typeof typedFeatures): Promise<void> {
  target.value = ''
  const chars = [...full]
  const slipAt = chars.length > 8 && Math.random() < 0.7 ? jitter(4, chars.length - 2) : -1
  let i = 0

  while (i < chars.length) {
    if (cancelled) {
      return
    }

    if (i > 0 && chars[i - 1] === ' ') {
      await sleep(jitter(320, 900))
    } else if (i > 0 && Math.random() < 0.35) {
      await sleep(jitter(220, 640))
    }

    const burst = jitter(2, 4)
    for (let n = 0; n < burst && i < chars.length; n++) {
      if (cancelled) {
        return
      }
      const char = chars[i]!
      if (i === slipAt && /[a-z]/i.test(char)) {
        await press(target, mistype(char))
        await sleep(jitter(280, 620))
        await backspace(target)
      }
      await press(target, char)
      i++
      if (char === ' ' || '-/*'.includes(char)) {
        break
      }
    }
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
  await sleep(jitter(350, 650))
  await typeCommand(FEATURES_CMD, typedFeatures)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(jitter(450, 900))
  showFeatures.value = true
  typing.value = 'composables'
  await sleep(jitter(1100, 2000))
  await typeCommand(COMPOSABLES_CMD, typedComposables)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(jitter(450, 900))
  for (let i = 1; i <= composables.length; i++) {
    if (cancelled) {
      return
    }
    snippetCount.value = i
    await sleep(jitter(50, 130))
  }

  typing.value = 'npm'
  await sleep(jitter(1200, 2100))
  await typeCommand(NPM_CMD, typedNpm)
  if (cancelled) {
    return
  }
  typing.value = null
  await sleep(jitter(450, 900))
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

const draft = ref('')
const log = ref<{ cmd: string; out: string }[]>([])
const idlePrompt = ref<{ focus: () => void } | null>(null)

watch(showIdle, async (visible) => {
  if (!visible) {
    return
  }
  await nextTick()
  idlePrompt.value?.focus()
})

function runIdleCommand(): void {
  const cmd = draft.value.trim()
  draft.value = ''
  if (!cmd) {
    return
  }
  if (cmd === 'clear') {
    log.value = []
    return
  }
  log.value.push({ cmd, out: "I'm sorry, I'm not that kinda website." })
  void nextTick(() => idlePrompt.value?.focus())
}
</script>

<template>
  <main>
    <ShellPrompt :cmd="typedFeatures" :typing="typing === 'features'" />
    <pre v-if="showFeatures" class="shell-md shell-boot-in"><span
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

    <template v-for="(entry, i) in log" :key="i">
      <ShellPrompt :cmd="entry.cmd" />
      <pre class="shell-err">{{ entry.out }}</pre>
    </template>

    <ShellPrompt
      v-if="showIdle"
      ref="idlePrompt"
      v-model="draft"
      interactive
      @submit="runIdleCommand"
    />
  </main>
</template>
