/**
 * Gemini bills multimodal input heavily per image pixel. Downscale before upload
 * so free-tier input_token quota is not exhausted by one phone photo.
 */
const DEFAULT_MAX_EDGE = 896
const JPEG_QUALITY = 0.78

export async function shrinkImageForGeminiUpload(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE,
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      const w = bmp.width
      const h = bmp.height
      if (w <= 0 || h <= 0) throw new Error('invalid image size')
      const scale = Math.min(1, maxEdge / Math.max(w, h))
      const tw = Math.max(1, Math.round(w * scale))
      const th = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = tw
      canvas.height = th
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas context')
      ctx.drawImage(bmp, 0, 0, tw, th)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
      })
      if (!blob || blob.size < 24) throw new Error('encode failed')
      const buffer = await blob.arrayBuffer()
      return { buffer, mimeType: 'image/jpeg' }
    } finally {
      bmp.close?.()
    }
  } catch {
    const buffer = await file.arrayBuffer()
    const mime =
      file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg'
    return { buffer, mimeType: mime }
  }
}
