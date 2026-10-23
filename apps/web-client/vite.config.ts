import path from 'path'
import { fileURLToPath } from 'url'

import { defineConfig, type UserConfig } from 'vite'

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
    define: {
      ...base.define,
      // Desktop-renderer code branches on this for the few browser differences.
      'import.meta.env.VITE_HERMES_WEB': JSON.stringify('1')
    },
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
