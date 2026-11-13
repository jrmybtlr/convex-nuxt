/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // `conventionalcommits` (unlike `angular`) understands `feat!:` headers.
        preset: 'conventionalcommits',
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          // Any other commit that reaches this workflow (src/ changes on main)
          // still publishes at least a patch. Rule values are globs matched
          // against string fields; `hash` is always a plain hex string, so
          // this matches every commit, including unconventional headers.
          { hash: '*', release: 'patch' },
        ],
      },
    ],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    '@semantic-release/npm',
    '@semantic-release/github',
  ],
}
