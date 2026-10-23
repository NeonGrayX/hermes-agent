import { createWebBridge } from './bridge'
import { trackVisualViewport } from './viewport'

window.hermesDesktop = createWebBridge()
document.documentElement.dataset.hermesWeb = 'true'
trackVisualViewport()
