import path from 'path'
import { fileURLToPath } from 'url'

import { defineConfig, type Plugin, type UserConfig } from 'vite'

import desktopConfig from '../desktop/vite.config.ts'

const __dirname: string = path.dirname(fileURLToPath(import.meta.url))

// The gateway this dev server proxies to. Production deployments serve the
// built bundle from the same origin as the gateway (see README), so only dev
// needs a target.
const gatewayTarget = process.env.HERMES_GATEWAY_URL || 'http://127.0.0.1:9119'

// Every path the gateway owns. The renderer, the login page and the session
// cookies must share one origin: the gateway's CORS policy only admits
// loopback origins, and its WebSocket Origin check rejects any other host.
// /fonts: the gateway's sign-in page loads its brand fonts from there.
const gatewayPaths = ['/api', '/auth', '/login', '/fonts']

// "Add to Home Screen" installs a standalone app (no browser chrome). Emitted
// here rather than dropped into publicDir, which is the desktop app's own.
const MANIFEST = JSON.stringify({
  name: 'Hermes',
  short_name: 'Hermes',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  icons: [{ src: '/apple-touch-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }]
})

function webManifest(): Plugin {
  return {
    name: 'hermes-web-manifest',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(MANIFEST)
      })
    },
    generateBundle() {
      this.emitFile({ fileName: 'manifest.webmanifest', source: MANIFEST, type: 'asset' })
    }
  }
}

// The renderer is the desktop app's, unchanged: its config carries the
// aliases, React Compiler pass, chunking and asset plugins. This config only
// swaps the HTML entry (which installs the web bridge) and the dev server.
export default defineConfig(async env => {
  const base = (await (typeof desktopConfig === 'function' ? desktopConfig(env) : desktopConfig)) as UserConfig

  return {
    ...base,
    root: __dirname,
    base: '/',
    publicDir: path.resolve(__dirname, '../desktop/public'),
    plugins: [...(base.plugins ?? []), webManifest()],
    build: {
      ...base.build,
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      manifest: false
    },
    server: {
      ...base.server,
      host: process.env.HERMES_WEB_HOST || '127.0.0.1',
      port: Number(process.env.HERMES_WEB_PORT || 5175),
      strictPort: true,
      proxy: Object.fromEntries(
        gatewayPaths.map(prefix => [prefix, { target: gatewayTarget, ws: prefix === '/api', xfwd: true }])
      )
    },
    preview: {
      host: process.env.HERMES_WEB_HOST || '127.0.0.1',
      port: Number(process.env.HERMES_WEB_PORT || 4175)
    }
  }
})
