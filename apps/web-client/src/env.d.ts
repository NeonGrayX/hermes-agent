interface ImportMetaEnv {
  /** Defined by apps/web-client/vite.config.ts: the renderer is running in a browser with the web bridge. */
  readonly VITE_HERMES_WEB?: string
  /** Optional build label shown in Settings → About. */
  readonly VITE_HERMES_WEB_VERSION?: string
}
