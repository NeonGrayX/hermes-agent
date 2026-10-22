import type { HermesNotification } from '../../../desktop/electron/notification-types'

/** Clipboard writes need a secure context (HTTPS or localhost). A plain-HTTP
 *  LAN address falls back to the legacy selection copy. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)

    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()

    try {
      return document.execCommand('copy')
    } finally {
      field.remove()
    }
  }
}

export async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

export function downloadUrl(url: string, filename?: string): boolean {
  const link = document.createElement('a')
  link.href = url
  link.download = filename || ''
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()

  return true
}

export function saveText(request: { content: string; defaultPath?: string }): {
  canceled?: boolean
  path?: string
  saved: boolean
} {
  const name = request.defaultPath?.split(/[\\/]/).pop() || 'hermes.txt'
  const url = URL.createObjectURL(new Blob([request.content], { type: 'text/plain;charset=utf-8' }))

  try {
    downloadUrl(url, name)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return { path: name, saved: true }
}

/** Web Notifications need a secure context and a granted permission; on iOS
 *  only an installed (home-screen) web app may show them. */
export function showNotification(payload: HermesNotification): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.hasFocus()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }

    return false
  }

  const notification = new Notification(payload.title || 'Hermes', {
    body: payload.body,
    silent: payload.silent,
    tag: payload.tag || payload.sessionId
  })

  notification.onclick = () => {
    window.focus()

    if (payload.activate) {
      window.location.hash = payload.activate
    }

    notification.close()
  }

  return true
}
