import { createWebBridge } from './bridge'
import { trackVisualViewport } from './viewport'

// crypto.randomUUID exists only in secure contexts, and a gateway opened by
// its plain-HTTP LAN address is not one. The renderer mints ids with it
// (message submit among them); getRandomValues works everywhere.
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
  }
}

window.hermesDesktop = createWebBridge()
document.documentElement.dataset.hermesWeb = 'true'
trackVisualViewport()
