// The bridge must exist before the desktop renderer's module graph evaluates:
// several stores read window.hermesDesktop at import time. ES modules evaluate
// side-effect imports in order, so this one runs first.
import './install-bridge'
import '@/main'
// After the renderer's styles, so these win ties.
import './web.css'
