import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
// @ts-expect-error -- plain JS config without type declarations
import releaseConfig from '../release.config.js'

const config = releaseConfig as { plugins: unknown[] }

type Analyze = (
  pluginConfig: unknown,
  context: { cwd: string; commits: Array<{ hash: string; message: string }>; logger: unknown },
) => Promise<string | null>

// The plugins are dependencies of semantic-release, not of this package.
async function loadPlugin(name: string): Promise<Record<string, unknown>> {
  const require = createRequire(import.meta.url)
  const fromSemanticRelease = createRequire(require.resolve('semantic-release'))
  return await import(pathToFileURL(fromSemanticRelease.resolve(name)).href)
}

async function loadAnalyzer(): Promise<Analyze> {
  return (await loadPlugin('@semantic-release/commit-analyzer')).analyzeCommits as Analyze
}

const analyzerOptions = (
  config.plugins.find(
    (plugin: unknown) => Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer',
  ) as [string, unknown]
)[1]

async function releaseFor(...messages: string[]): Promise<string | null> {
  const analyzeCommits = await loadAnalyzer()
  return analyzeCommits(analyzerOptions, {
    cwd: process.cwd(),
    logger: { log() {} },
    commits: messages.map((message, index) => ({
      hash: (index + 1).toString(16).padStart(40, 'a'),
      message,
    })),
  })
}

describe('release.config.js release rules', () => {
  it('releases a major for `!` headers and BREAKING CHANGE footers', async () => {
    expect(await releaseFor('feat!: drop v1')).toBe('major')
    expect(await releaseFor('feat(auth)!: drop v1 (#14)')).toBe('major')
    expect(await releaseFor('refactor!: rename option')).toBe('major')
    expect(await releaseFor('feat: new api\n\nBREAKING CHANGE: old api removed')).toBe('major')
  })

  it('releases a minor for features', async () => {
    expect(await releaseFor('feat: add composable')).toBe('minor')
    expect(await releaseFor('feat(auth): add composable (#12)')).toBe('minor')
  })

  it('releases a patch for every other commit, conventional or not', async () => {
    for (const message of [
      'fix: handle null',
      'perf: cache key',
      'chore: tidy',
      'docs: update src/.nuxt ignore',
      'refactor(query): simplify',
      'Update dependencies, enhance .gitignore',
      "Merge branch 'main' of github.com:owner/repo",
      '.gitignore tweak',
      'fix: handle ../relative and ./.hidden/.paths',
    ]) {
      expect(await releaseFor(message), message).toBe('patch')
    }
  })

  it('takes the highest release across commits', async () => {
    expect(await releaseFor('chore: tidy', 'feat: add', 'docs: x')).toBe('minor')
    expect(await releaseFor('fix: a', 'feat!: b')).toBe('major')
  })

  // Guards the preset version: a preset newer than the writer bundled with
  // semantic-release parses commits fine but throws while rendering notes.
  it('renders release notes with the same preset', async () => {
    const notesPlugin = config.plugins.find(
      (plugin: unknown) =>
        Array.isArray(plugin) && plugin[0] === '@semantic-release/release-notes-generator',
    ) as [string, { preset: string }]
    expect(notesPlugin[1].preset).toBe('conventionalcommits')

    const { generateNotes } = (await loadPlugin('@semantic-release/release-notes-generator')) as {
      generateNotes: (pluginConfig: unknown, context: unknown) => Promise<string>
    }
    const notes = await generateNotes(notesPlugin[1], {
      cwd: process.cwd(),
      logger: { log() {} },
      options: { repositoryUrl: 'https://github.com/owner/repo.git' },
      lastRelease: { gitTag: 'v1.0.0', version: '1.0.0' },
      nextRelease: { gitTag: 'v2.0.0', version: '2.0.0' },
      commits: ['feat!: drop v1 (#2)', 'fix: handle null', 'chore: tidy'].map((message, index) => ({
        hash: (index + 1).toString(16).padStart(40, 'a'),
        message,
        committerDate: '2026-01-01T00:00:00.000Z',
      })),
    })
    expect(notes).toContain('BREAKING CHANGES')
    expect(notes).toContain('drop v1')
    expect(notes).toContain('handle null')
  })
})
