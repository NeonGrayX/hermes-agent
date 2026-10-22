import { createWebBridge } from './bridge'

window.hermesDesktop = createWebBridge()
document.documentElement.dataset.hermesWeb = 'true'
