import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export type FileReadProgress = (stage: string, progress: number | null) => void

function extOf(file: File): string {
  const n = file.name.toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i) : ''
}

export async function extractPlainTextFromFile(
  file: File,
  onProgress?: FileReadProgress,
): Promise<string> {
  const ext = extOf(file)
  switch (ext) {
    case '.txt':
    case '.csv':
    case '.tsv':
      onProgress?.('Reading text file…', null)
      return file.text()
    case '.docx': {
      onProgress?.('Reading Word document…', null)
      const mammoth = await import('mammoth')
      const arr = await file.arrayBuffer()
      const r = await mammoth.extractRawText({ arrayBuffer: arr })
      return r.value
    }
    case '.pdf': {
      onProgress?.('Loading PDF…', null)
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
      const buf = await file.arrayBuffer()
      const loading = pdfjs.getDocument({ data: new Uint8Array(buf) })
      const doc = await loading.promise
      try {
        const n = doc.numPages
        const bufLines: string[] = []
        for (let i = 1; i <= n; i++) {
          onProgress?.(`Reading PDF page ${i} of ${n}…`, n > 0 ? i / n : null)
          const page = await doc.getPage(i)
          const textContent = await page.getTextContent()
          const line = textContent.items
            .map((item) => (item && typeof item === 'object' && 'str' in item ? String((item as { str: string }).str) : ''))
            .join(' ')
            .trim()
          if (line) bufLines.push(line)
        }
        return bufLines.join('\n\n')
    } finally {
      await doc.destroy()
    }
    }
    default:
      throw new Error(`Unsupported file type (${ext || 'unknown'}). Use PDF, DOCX, TXT, CSV, or TSV.`)
  }
}
