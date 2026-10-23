// Browser stand-ins for the edit verbs Electron's main process runs for the
// app context menu (webContents.copy/cut/paste/selectAll and copyImageAt).
// The menu closes and refocuses the field before calling these, inside the
// same click's user activation, so execCommand and the async clipboard work.

type EditCommand = 'copy' | 'cut' | 'paste' | 'selectAll'

let lastImage: HTMLImageElement | null = null

/** Remember the image under each right-click: copyImage acts on the last
 *  gesture, like Electron's copyImageAt(x, y) from the same params. */
export function trackContextMenuTarget(): void {
  window.addEventListener(
    'contextmenu',
    event => {
      const element = event.target instanceof Element ? event.target : null

      lastImage = element?.closest('img') ?? null
    },
    true
  )
}

export async function contextMenuEdit(command: EditCommand): Promise<void> {
  if (command !== 'paste') {
    document.execCommand(command)

    return
  }

  let text = ''

  try {
    text = await navigator.clipboard.readText()
  } catch {
    // Permission denied or unsupported: nothing to paste, same as an empty clipboard.
    return
  }

  // insertText goes through the field's own input pipeline (undo stack,
  // input/beforeinput events), so React and the composer editor see it.
  if (text && !document.execCommand('insertText', false, text)) {
    const field = document.activeElement

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.setRangeText(text, field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
}

async function imagePng(image: HTMLImageElement): Promise<Blob> {
  const source = image.currentSrc || image.src
  const response = await fetch(source, { credentials: 'include' })
  const blob = await response.blob()

  if (blob.type === 'image/png') {
    return blob
  }

  // The async clipboard only guarantees image/png; re-encode anything else.
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')

  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(png => (png ? resolve(png) : reject(new Error('image encode failed'))), 'image/png')
  )
}

export async function contextMenuCopyImage(): Promise<void> {
  const image = lastImage

  if (!image || typeof ClipboardItem === 'undefined') {
    return
  }

  // Hand the clipboard a pending blob so the write starts inside the click's
  // activation (Safari rejects a write that begins after an await).
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagePng(image) })])
}
