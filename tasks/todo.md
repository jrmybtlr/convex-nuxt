# Fix NUXT_B8017: use-convex could not be loaded

- [x] Identify why Nuxt cannot resolve `modules: ['use-convex']` in the playground
- [x] Point playground at local module source (`../src/module`)
- [x] Verify Nuxt can initialize the playground after the change

## Review

`NUXT_B8017` happened because the playground loaded the module by package name (`use-convex`). After the rename from `@convex/nuxt`, Nuxt's resolver could not find that name (and cached the miss in the long-running `nuxt dev` process).

The playground now uses `../src/module`, which is the Nuxt module-starter pattern and matches the test fixtures. `nuxi prepare playground` succeeds, and the running playground restarted without the error.

Consumer apps still install with `modules: ['use-convex']` as documented in the README.
