// Mirror the visual viewport into CSS variables (read by web.css). Layout
// viewport units ignore the on-screen keyboard on iOS Safari, and
// `interactive-widget=resizes-content` only covers Chromium, so the shell sizes
// itself from window.visualViewport instead.

/** A visual viewport this much shorter than the layout viewport means a
 *  keyboard, not browser chrome. */
const KEYBOARD_MIN_PX = 120

export function trackVisualViewport(): void {
  const viewport = window.visualViewport

  if (!viewport) {
    return
  }

  const root = document.documentElement
  let frame = 0

  const update = () => {
    frame = 0
    root.style.setProperty('--hermes-web-viewport-height', `${viewport.height}px`)
    root.style.setProperty('--hermes-web-viewport-top', `${viewport.offsetTop}px`)
    root.toggleAttribute('data-keyboard-open', window.innerHeight - viewport.height > KEYBOARD_MIN_PX)
  }

  const schedule = () => {
    frame ||= requestAnimationFrame(update)
  }

  update()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
}
