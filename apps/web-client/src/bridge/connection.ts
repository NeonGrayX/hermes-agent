import type { GatewayWsUrlResult } from '@hermes/shared'

import type { DesktopActiveProfile, HermesConnection } from '@/global'

import { gatewayBaseUrl, gatewayWsBaseUrl, redirectToSignIn } from './http'

// The browser has no Electron main process to hold the window's profile, so
// the choice lives with the origin. `profile.set` reloads, like Electron's
// hard re-home.
const PROFILE_KEY = 'hermes-web:profile'

export function storedProfile(): null | string {
  try {
    return localStorage.getItem(PROFILE_KEY)?.trim() || null
  } catch {
    return null
  }
}

export function storeProfile(name: null | string): DesktopActiveProfile {
  const profile = name?.trim() || null

  try {
    if (profile) {
      localStorage.setItem(PROFILE_KEY, profile)
    } else {
      localStorage.removeItem(PROFILE_KEY)
    }
  } catch {
    // Storage disabled (private mode): the choice lasts for this page only.
  }

  return { profile }
}

let sessionCheck: Promise<void> | null = null

/** Resolves once the gateway session cookie is valid; otherwise navigates to
 *  the gateway login page. Checked once per page load. */
function ensureSignedIn(): Promise<void> {
  sessionCheck ??= fetch(`${gatewayBaseUrl()}/api/auth/me`, { credentials: 'same-origin' }).then(response => {
    if (response.status === 401) {
      return redirectToSignIn()
    }

    if (!response.ok) {
      sessionCheck = null

      throw new Error(`Hermes gateway answered ${response.status} to the session check.`)
    }
  })

  return sessionCheck
}

/** One gateway serves every profile (the `sharedRemote` shape Electron gives a
 *  global remote): a non-primary profile rides the primary socket and REST
 *  calls carry `?profile=`. */
export async function getConnection(profile?: null | string): Promise<HermesConnection> {
  await ensureSignedIn()

  const primary = storedProfile()
  const requested = profile?.trim() || null
  const shared = Boolean(requested && requested !== primary)
  const scoped = requested ?? primary

  return {
    authMode: 'oauth',
    baseUrl: gatewayBaseUrl(),
    isFullscreen: false,
    logs: [],
    mode: 'remote',
    nativeOverlayWidth: 0,
    remoteHost: window.location.host,
    remoteKind: 'url',
    token: '',
    windowButtonPosition: null,
    // Minted per dial by getGatewayWsUrl: tickets are single use.
    wsUrl: '',
    ...(scoped ? { profile: scoped } : {}),
    ...(shared ? { sharedPrimary: true, sharedRemote: true } : {})
  }
}

/** A fresh single-use ticket per WebSocket dial (~30s TTL). */
export async function getGatewayWsUrl(): Promise<GatewayWsUrlResult> {
  const response = await fetch(`${gatewayBaseUrl()}/api/auth/ws-ticket`, {
    credentials: 'same-origin',
    method: 'POST'
  }).catch((error: unknown) => {
    throw new Error(`Could not reach the Hermes gateway: ${error instanceof Error ? error.message : String(error)}`)
  })

  if (response.status === 401 || response.status === 403) {
    void redirectToSignIn()

    return { error: 'Your Hermes session expired. Sign in again.', needsOauthLogin: true, ok: false }
  }

  if (!response.ok) {
    return { error: `Hermes gateway answered ${response.status} when minting a socket ticket.`, ok: false }
  }

  const { ticket } = (await response.json()) as { ticket?: unknown }

  if (typeof ticket !== 'string' || !ticket) {
    return { error: 'Gateway did not return a WS ticket.', ok: false }
  }

  return { ok: true, wsUrl: `${gatewayWsBaseUrl()}/api/ws?ticket=${encodeURIComponent(ticket)}` }
}
