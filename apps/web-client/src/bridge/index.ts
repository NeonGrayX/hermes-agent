import type {
  DesktopBootProgress,
  DesktopBootstrapState,
  DesktopConnectionConfig,
  DesktopConnectionsRegistry,
  DesktopVersionInfo,
  HermesApiRequest,
  HermesReadDirResult,
  HermesReadFileTextResult
} from '@/global'

import { getConnection, getGatewayWsUrl, storedProfile, storeProfile } from './connection'
import { gatewayBaseUrl, gatewayFetchJson, redirectToSignIn } from './http'
import { copyText, downloadUrl, readClipboardText, saveText, showNotification } from './web-platform'

type HermesDesktopBridge = Window['hermesDesktop']

const noop = (): void => undefined
const unsubscribe = (): (() => void) => noop

/** A capability that needs the Electron main process (local disk, OS windows,
 *  native menus, the local install). Rejects with a message the renderer's
 *  error surfaces show as-is. */
function unsupported(feature: string) {
  return (): Promise<never> => Promise.reject(new Error(`${feature} is not available in the Hermes web client.`))
}

function api<T>(request: HermesApiRequest): Promise<T> {
  return gatewayFetchJson<T>(request, storedProfile())
}

function fsGet<T>(endpoint: string, path: string): Promise<T> {
  return api<T>({ path: `/api/fs/${endpoint}?path=${encodeURIComponent(path)}` })
}

async function readFileDataUrl(path: string): Promise<string> {
  const result = await fsGet<string | { dataUrl?: string }>('read-data-url', path)

  return typeof result === 'string' ? result : (result?.dataUrl ?? '')
}

function bootProgress(): DesktopBootProgress {
  return {
    error: null,
    fakeMode: false,
    message: '',
    phase: 'ready',
    progress: 100,
    running: false,
    timestamp: Date.now()
  }
}

const bootstrapState: DesktopBootstrapState = {
  active: false,
  bundled: false,
  completedAt: null,
  error: null,
  log: [],
  manifest: null,
  setupChoice: null,
  stages: {},
  startedAt: null,
  unsupportedPlatform: null
}

function connectionConfig(): DesktopConnectionConfig {
  return {
    cloudOrg: '',
    // The gateway is fixed by the page origin, so Settings shows it read-only.
    envOverride: true,
    mode: 'remote',
    profile: null,
    remoteAuthMode: 'oauth',
    remoteOauthConnected: true,
    remoteTokenPlainText: false,
    remoteTokenPreview: null,
    remoteTokenSet: false,
    remoteUrl: gatewayBaseUrl(),
    secureTokenStorage: false,
    sshHost: '',
    sshKeyPath: '',
    sshPort: null,
    sshRemoteHermesPath: '',
    sshRemoteProfile: '',
    sshUser: ''
  }
}

const registry: DesktopConnectionsRegistry = {
  connections: [],
  primary: '',
  secureTokenStorage: false,
  version: 2
}

function versionInfo(): DesktopVersionInfo {
  return {
    appVersion: import.meta.env.VITE_HERMES_WEB_VERSION || 'web',
    electronVersion: '',
    hermesRoot: '',
    hermesRuntime: { type: 'light' },
    nodeVersion: '',
    platform: 'web'
  }
}

async function signOut(): Promise<{ connected: boolean; ok: boolean }> {
  await fetch(`${gatewayBaseUrl()}/auth/logout`, { credentials: 'same-origin', method: 'POST' }).catch(() => null)
  void redirectToSignIn()

  return { connected: false, ok: true }
}

export function createWebBridge(): HermesDesktopBridge {
  return {
    // --- Gateway connection -------------------------------------------------
    getConnection,
    getGatewayWsUrl,
    getProfileRoutes: () => Promise.resolve([]),
    revalidateConnection: () => Promise.resolve({ ok: true, rebuilt: false }),
    api,
    getBootProgress: () => Promise.resolve(bootProgress()),
    onBootProgress: unsubscribe,
    onBackendExit: unsubscribe,
    getBootstrapState: () => Promise.resolve(bootstrapState),
    onBootstrapEvent: unsubscribe,
    continueBootstrapLocal: unsupported('Installing Hermes locally'),
    resetBootstrap: unsupported('Installing Hermes locally'),
    repairBootstrap: unsupported('Installing Hermes locally'),
    cancelBootstrap: () => Promise.resolve({ cancelled: false, ok: true }),
    updateHold: {
      quit: () => Promise.resolve({ ok: false }),
      recheck: () => Promise.resolve({ ok: true }),
      startAnyway: () => Promise.resolve({ ok: false })
    },

    // --- Connection settings: fixed by the page origin ------------------------
    getConnectionConfig: () => Promise.resolve(connectionConfig()),
    saveConnectionConfig: unsupported('Changing the gateway'),
    applyConnectionConfig: unsupported('Changing the gateway'),
    testConnectionConfig: unsupported('Testing another gateway'),
    probeConnectionConfig: unsupported('Probing another gateway'),
    oauthLoginConnectionConfig: async () => {
      await redirectToSignIn()

      return { baseUrl: gatewayBaseUrl(), connected: true, ok: true }
    },
    oauthLogoutConnectionConfig: signOut,
    getSecretStorageEncryption: () => Promise.resolve({ on: false }),
    setSecretStorageEncryption: unsupported('OS keychain storage'),
    connections: {
      list: () => Promise.resolve(registry),
      remove: unsupported('Managing gateways'),
      save: unsupported('Managing gateways'),
      setPrimary: unsupported('Managing gateways'),
      test: unsupported('Managing gateways')
    },
    sshConfigHosts: unsupported('SSH connections'),
    sshResolveHost: unsupported('SSH connections'),
    cloud: {
      agentSignIn: unsupported('Hermes Cloud'),
      discover: unsupported('Hermes Cloud'),
      login: unsupported('Hermes Cloud'),
      logout: unsupported('Hermes Cloud'),
      status: () => Promise.resolve({ portalBaseUrl: '', signedIn: false })
    },
    profile: {
      get: () => Promise.resolve({ profile: storedProfile() }),
      getDefault: () => Promise.resolve(null),
      onDefaultChanged: unsubscribe,
      remember: name => Promise.resolve(storeProfile(name)),
      set: name => {
        const active = storeProfile(name)
        window.location.reload()

        return Promise.resolve(active)
      },
      setDefault: route => {
        storeProfile(route.profile)

        return Promise.resolve(route)
      }
    },

    // --- Windows: one browser tab ---------------------------------------------
    openSessionWindow: () => Promise.resolve({ error: 'unsupported', ok: false }),
    openSessionInTerminal: () => Promise.resolve({ error: 'unsupported', ok: false }),
    openWindow: () => {
      window.open(window.location.href, '_blank', 'noopener')

      return Promise.resolve({ ok: true })
    },
    openBrowserWindow: () => Promise.resolve({ error: 'unsupported', ok: false }),
    onBrowserPopoutClosed: unsubscribe,
    claimAmbientCue: () => Promise.resolve(true),
    windowControls: { close: noop, custom: false, minimize: noop, toggleMaximize: noop },
    petOverlay: {
      close: () => Promise.resolve({ ok: true }),
      control: noop,
      onControl: unsubscribe,
      onState: unsubscribe,
      open: () => Promise.resolve({ ok: false }),
      pushState: noop,
      setBounds: noop,
      setFocusable: noop,
      setIgnoreMouse: noop
    },
    quickEntry: {
      ackSubmit: noop,
      dismiss: noop,
      getSettings: () => Promise.resolve({ enabled: false, error: null, registered: false, shortcut: '' }),
      onLateResult: unsubscribe,
      onShown: unsubscribe,
      onState: unsubscribe,
      onSubmit: unsubscribe,
      pushState: noop,
      setSettings: () => Promise.resolve({ enabled: false, error: null, registered: false, shortcut: '' }),
      submit: unsupported('Quick Entry')
    },
    findInPage: () => Promise.resolve({ count: 0 }),
    stopFindInPage: () => Promise.resolve(),
    onFoundInPage: unsubscribe,
    onOpenFindBarRequested: unsubscribe,
    onPreviewFileChanged: unsubscribe,

    // --- Browser platform -----------------------------------------------------
    notify: payload => Promise.resolve(showNotification(payload)),
    requestMicrophoneAccess: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())

        return true
      } catch {
        return false
      }
    },
    openExternal: url => {
      window.open(url, '_blank', 'noopener,noreferrer')

      return Promise.resolve()
    },
    writeClipboard: copyText,
    readClipboard: readClipboardText,
    saveImageFromUrl: url => Promise.resolve(downloadUrl(url)),
    saveTextFileAs: request => Promise.resolve(saveText(request)),
    saveGatewayFile: payload =>
      Promise.resolve({
        saved: downloadUrl(
          `${gatewayBaseUrl()}/api/files/download?path=${encodeURIComponent(payload.path)}`,
          payload.suggestedName
        )
      }),
    saveImageBuffer: unsupported('Saving to this device’s disk'),
    savePastedText: unsupported('Saving to this device’s disk'),
    saveClipboardImage: unsupported('Saving to this device’s disk'),
    getPathForFile: () => '',
    fetchLinkTitle: () => Promise.resolve(''),

    // --- Files: the gateway host's filesystem ---------------------------------
    readDir: path => fsGet<HermesReadDirResult>('list', path),
    readFileText: path => fsGet<HermesReadFileTextResult>('read-text', path),
    readFileDataUrl,
    readFileDataUrlForAttach: readFileDataUrl,
    selectPaths: () => Promise.resolve([]),
    normalizePreviewTarget: () => Promise.resolve(null),
    watchPreviewFile: unsupported('Watching files'),
    stopPreviewFileWatch: () => Promise.resolve(false),
    sanitizeWorkspaceCwd: cwd => Promise.resolve({ cwd: cwd ?? '', sanitized: false }),
    settings: {
      getDefaultProjectDir: () => Promise.resolve({ defaultLabel: '', dir: null, resolvedCwd: '' }),
      pickDefaultProjectDir: () => Promise.resolve({ canceled: true, dir: null }),
      setDefaultProjectDir: dir => Promise.resolve({ dir })
    },
    terminal: {
      attach: () => Promise.resolve(false),
      cwd: () => Promise.resolve(null),
      dispose: () => Promise.resolve(false),
      onData: unsubscribe,
      onExit: unsubscribe,
      resize: () => Promise.resolve(false),
      start: unsupported('A terminal on this device'),
      write: () => Promise.resolve(false)
    },

    // --- Diagnostics, updates and install management --------------------------
    revealLogs: () => Promise.resolve({ error: 'unsupported', ok: false, path: '' }),
    getRecentLogs: () => Promise.resolve({ lines: [], path: '' }),
    getVersion: () => Promise.resolve(versionInfo()),
    getSyncStatus: () => Promise.resolve(null),
    updates: {
      apply: unsupported('Updating Hermes'),
      check: () => Promise.resolve({ reason: 'web-client', supported: false }),
      onProgress: unsubscribe
    },
    uninstall: {
      openAppsSettings: unsupported('Uninstalling Hermes'),
      run: unsupported('Uninstalling Hermes'),
      summary: unsupported('Uninstalling Hermes')
    },
    themes: {
      fetchMarketplace: unsupported('The theme marketplace'),
      searchMarketplace: unsupported('The theme marketplace')
    }
  }
}
