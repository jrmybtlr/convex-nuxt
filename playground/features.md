# Features

First-class Convex for Nuxt 4.

SSR snapshots hydrate through the Nuxt payload, then the browser overlays a live WebSocket. Same `useAsyncData` key. No loading flash.

- Queries, mutations, actions, and pagination
- Authenticated queries (JWT cookie / HttpOnly)
- Optimistic mutations
- Convex Auth, or bring your own (Clerk, Auth0)
- File uploads (Convex storage + R2)
- Nitro `fetchQuery` / `fetchMutation` / `fetchAction`
- Nuxt DevTools Convex tab
