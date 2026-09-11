# Better Convex file upload management

- [x] Add `useConvexFileUpload` composable + module auto-import/types
- [x] Add files schema + auth-gated generateUploadUrl/save/list/remove in playground
- [x] Wire upload/list/delete demo into playground extras
- [x] README docs + unit tests for upload success/failure/SSR guard

## Review

- `useConvexFileUpload` wraps generateUploadUrl → XHR POST (with progress) → saveFile
- Playground `files` table/functions enforce auth + ownership; extras page demos the flow
- Unit tests cover happy path, HTTP failure, and missing browser client; convex-test covers auth/CRUD
- README documents the composable and warns against unauthenticated `generateUploadUrl`
