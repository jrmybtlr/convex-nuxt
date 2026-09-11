import { useNuxtApp } from 'nuxt/app'
import { toValue, type MaybeRefOrGetter } from 'vue'

/**
 * When HttpOnly auth leaves the client without a JWT for HttpClient, keep the
 * hydrated Nuxt payload and let the live subscription own updates.
 */
export function readHydratedPayloadCache<T>(
  key: MaybeRefOrGetter<string>,
): T | null {
  const nuxtApp = useNuxtApp()
  const cached = nuxtApp.payload.data[toValue(key)]
  return (cached ?? null) as T | null
}
