const MAX_INPUT_BYTES = 8 * 1024 * 1024
const MAX_DIMENSION = 10_000

export type MediaKind = 'profile' | 'logo'

type ImageRules = {
  maxDimension: number
  targetBytes: number
}

const RULES: Record<MediaKind, ImageRules> = {
  profile: { maxDimension: 512, targetBytes: 300 * 1024 },
  logo: { maxDimension: 1200, targetBytes: 700 * 1024 },
}

export async function optimizeImage(file: File, kind: MediaKind): Promise<File> {
  if (file.size <= 0 || file.size > MAX_INPUT_BYTES) {
    throw new Error('La imagen debe pesar menos de 8 MB.')
  }

  const detectedType = await detectRasterMime(file)
  if (!detectedType) {
    throw new Error('Formato no permitido. Usa JPG, PNG o WEBP.')
  }
  if (file.type && file.type !== detectedType) {
    throw new Error('El contenido de la imagen no coincide con su formato declarado.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION) {
      throw new Error('Las dimensiones de la imagen no son válidas.')
    }

    const { maxDimension, targetBytes } = RULES[kind]
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('No se pudo procesar la imagen en este dispositivo.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    let blob: Blob | null = null
    for (const quality of [0.86, 0.78, 0.70, 0.62]) {
      blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob.size <= targetBytes) break
    }
    if (!blob) throw new Error('No se pudo optimizar la imagen.')
    if (blob.size > 2 * 1024 * 1024) throw new Error('La imagen optimizada sigue siendo demasiado grande.')

    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || kind
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}

export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const mediaUrl = new URL(url)
    const supabaseUrl = new URL(import.meta.env.VITE_SUPABASE_URL)
    if (mediaUrl.origin !== supabaseUrl.origin) return null
    const marker = '/storage/v1/object/public/oxxen-connect-media/'
    const index = mediaUrl.pathname.indexOf(marker)
    if (index < 0) return null
    const path = mediaUrl.pathname.slice(index + marker.length)
    return path ? decodeURIComponent(path) : null
  } catch {
    return null
  }
}

async function detectRasterMime(file: File): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo convertir la imagen.')), type, quality)
  })
}
