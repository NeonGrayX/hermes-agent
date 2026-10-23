// Files on THIS device (picked, dropped, pasted). The renderer's remote mode
// already uploads attachments by reading their bytes through
// readFileDataUrl(path) — Electron reads the local disk there. A browser has
// no paths, so each File gets a virtual path under LOCAL_ROOT and the read
// methods serve those from memory; every other path is the gateway's.

import type { HermesReadFileTextResult, HermesSelectPathsOptions } from '@/global'

const LOCAL_ROOT = '/.hermes-web-local/'

/** Text previews are capped like the gateway's read-text endpoint. */
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024

const blobs = new Map<string, Blob>()
const pathsByFile = new WeakMap<Blob, string>()

export const isLocalPath = (path: string): boolean => path.startsWith(LOCAL_ROOT)

/** The virtual path of `blob`; the same File always gets the same path. */
export function localPathFor(blob: Blob, name: string): string {
  const known = pathsByFile.get(blob)

  if (known) {
    return known
  }

  // Keep the real name last: the renderer derives labels and image/text
  // handling from the basename and extension.
  const safeName = name.replace(/[\\/]/g, '_') || 'file'
  const path = `${LOCAL_ROOT}${crypto.randomUUID()}/${safeName}`
  blobs.set(path, blob)
  pathsByFile.set(blob, path)

  return path
}

export const pathForFile = (file: File): string => localPathFor(file, file.name)

function localBlob(path: string): Blob {
  const blob = blobs.get(path)

  if (!blob) {
    throw new Error(`${path.split('/').pop()} is no longer available; attach it again.`)
  }

  return blob
}

export function readLocalDataUrl(path: string): Promise<string> {
  const blob = localBlob(path)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(blob)
  })
}

export async function readLocalText(path: string): Promise<HermesReadFileTextResult> {
  const blob = localBlob(path)
  const truncated = blob.size > TEXT_PREVIEW_MAX_BYTES
  const text = await blob.slice(0, TEXT_PREVIEW_MAX_BYTES).text()

  return { byteSize: blob.size, mimeType: blob.type || undefined, path, text, truncated }
}

/** The browser's file chooser. Resolves [] when the user cancels. */
export function pickLocalFiles(options?: HermesSelectPathsOptions): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options?.multiple !== false
    input.accept = (options?.filters ?? []).flatMap(filter => filter.extensions.map(ext => `.${ext}`)).join(',')
    input.style.display = 'none'

    const finish = (paths: string[]) => {
      input.remove()
      resolve(paths)
    }

    input.addEventListener('change', () => finish([...(input.files ?? [])].map(pathForFile)), { once: true })
    input.addEventListener('cancel', () => finish([]), { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

const IMAGE_MIME: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

export function saveLocalImage(data: ArrayBuffer | Uint8Array, ext: string, name?: string): string {
  const extension = ext.replace(/^\./, '').toLowerCase() || 'png'
  const blob = new Blob([data as BlobPart], { type: IMAGE_MIME[extension] ?? 'application/octet-stream' })

  return localPathFor(blob, `${name || `image-${Date.now()}`}.${extension}`)
}

export function saveLocalText(text: string): string {
  return localPathFor(new Blob([text], { type: 'text/plain' }), `pasted-${Date.now()}.txt`)
}

/** The first image on the clipboard, or '' when there is none or the browser
 *  refuses (clipboard reads need a secure context and a user gesture). */
export async function saveClipboardImage(): Promise<string> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(candidate => candidate.startsWith('image/'))

      if (type) {
        const blob = await item.getType(type)

        return localPathFor(blob, `clipboard-${Date.now()}.${type.slice('image/'.length)}`)
      }
    }
  } catch {
    // Permission denied or unsupported: same as an empty clipboard.
  }

  return ''
}
