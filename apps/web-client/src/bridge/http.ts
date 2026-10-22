import type { HermesApiRequest } from '@/global'

import { profileCollectionRoute, profileRouteSuffix } from '../../../desktop/electron/profile-routes'

const DEFAULT_TIMEOUT_MS = 30_000

/** The gateway's origin plus any reverse-proxy prefix. The bundle is served
 *  from the gateway's own origin (HashRouter keeps the pathname fixed), so the
 *  directory of the current document is the gateway base. */
export function gatewayBaseUrl(): string {
  return `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}`
}

export function gatewayWsBaseUrl(): string {
  return gatewayBaseUrl().replace(/^http/, 'ws')
}

/** Error shape the Electron transport throws (`httpStatusError`): renderer
 *  classifiers read `statusCode`, and legacy readers parse the "<status>: "
 *  message prefix. */
export function httpStatusError(status: number, body: string): Error & { statusCode: number } {
  const error = new Error(`${status}: ${body}`) as Error & { statusCode: number }
  error.statusCode = status

  return error
}

/** Mirror of electron/connection-config.ts `pathWithProfileScope`: a shared
 *  multi-profile gateway needs `?profile=` on every scopable request, except
 *  paths that already name their profile. */
export function pathWithProfileScope(path: string, profile: null | string | undefined, method?: string): string {
  const scoped = String(profile ?? '').trim()

  if (!scoped || !path) {
    return path
  }

  const parsed = new URL(path, 'http://hermes.local')

  if (
    parsed.searchParams.has('profile') ||
    (profileRouteSuffix(parsed.pathname) && !profileCollectionRoute(parsed.pathname, method))
  ) {
    return path
  }

  parsed.searchParams.set('profile', scoped)

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

let signInRedirect: Promise<void> | null = null

/** Send the browser to the gateway's own login page, returning here after.
 *  Only a confirmed missing session redirects: a 401 from an individual
 *  endpoint is re-checked against /api/auth/me first. */
export function redirectToSignIn(): Promise<void> {
  signInRedirect ??= (async () => {
    const me = await fetch(`${gatewayBaseUrl()}/api/auth/me`, { credentials: 'same-origin' }).catch(() => null)

    if (me && me.status !== 401) {
      signInRedirect = null

      return
    }

    const next = window.location.pathname || '/'
    window.location.assign(`${gatewayBaseUrl()}/login?next=${encodeURIComponent(next)}`)
    // Navigation is underway; never settle so callers do not race the unload.
    await new Promise(() => undefined)
  })()

  return signInRedirect
}

function requestBody(request: HermesApiRequest): { body?: BodyInit; headers: Record<string, string> } {
  if (request.upload) {
    const form = new FormData()
    const blob = new Blob([request.upload.bytes], { type: request.upload.contentType || 'application/octet-stream' })
    form.append('file', blob, request.upload.filename)

    return { body: form, headers: {} }
  }

  if (request.body === undefined) {
    return { headers: {} }
  }

  return { body: JSON.stringify(request.body), headers: { 'Content-Type': 'application/json' } }
}

/** Same-origin JSON request against the gateway. Session cookies carry auth. */
export async function gatewayFetchJson<T>(request: HermesApiRequest, ambientProfile: null | string): Promise<T> {
  const method = (request.method || 'GET').toUpperCase()
  const path = pathWithProfileScope(request.path, request.profile ?? ambientProfile, method)
  const { body, headers } = requestBody(request)
  const signal = AbortSignal.timeout(request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_TIMEOUT_MS)

  const response = await fetch(`${gatewayBaseUrl()}${path}`, {
    body,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...headers },
    method,
    signal
  })

  const text = await response.text()

  if (response.status === 401) {
    void redirectToSignIn()
  }

  if (!response.ok) {
    throw httpStatusError(response.status, text || response.statusText)
  }

  if (!text) {
    return undefined as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `Expected JSON from ${path} but got HTML (status ${response.status}). The endpoint is likely missing on the Hermes backend.`
    )
  }
}
