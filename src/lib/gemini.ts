export type GeminiExtract = {
  word: string
  definition: string
  hint: string
  example: string
  language_code: string
}

type GenPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string
        data: string
      }
    }

const MODEL = 'gemini-2.0-flash'
const PROMPT =
  `You extract one flashcard from the user's input (text and/or image). Return ONLY valid JSON matching this schema (no markdown):
{"word":"","definition":"","hint":"","example":"","language_code":""}
- word: concise term or phrase
- definition: one or two sentences
- hint: short mnemonic or clue, no spoilers from definition verbatim
- example: natural usage sentence
- language_code: ISO 639-1 lowercase (e.g. en, es, fr).`

function endpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
}

function stripJsonFence(s: string): string {
  const t = s.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim()
  }
  return t
}

async function callGenerate(
  parts: GenPart[],
  auth: { accessToken?: string | null; apiKey?: string | null },
): Promise<string> {
  const url = endpoint()
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = auth.apiKey?.trim()
  if (key) {
    headers['x-goog-api-key'] = key
  } else if (auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`
  } else {
    throw new Error('Sign in with Google (for OAuth) or set VITE_GEMINI_API_KEY for dev.')
  }
  const resp = await fetch(url, { method: 'POST', headers, body })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(errText.slice(0, 400) || `Gemini HTTP ${resp.status}`)
  }
  const json = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    error?: { message?: string }
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text && json.error?.message) throw new Error(json.error.message)
  return text
}

export async function extractFromText(
  input: string,
  auth: { accessToken?: string | null; apiKey?: string | null },
): Promise<GeminiExtract> {
  const raw = await callGenerate([{ text: `${PROMPT}\nUser text:\n${input}` }], auth)
  return normalizeExtract(raw)
}

export async function extractFromImageBase64(
  mimeType: string,
  base64: string,
  caption: string,
  auth: { accessToken?: string | null; apiKey?: string | null },
): Promise<GeminiExtract> {
  const parts: GenPart[] = [
    { text: `${PROMPT}\nOptional context:\n${caption || '(none)'}` },
    {
      inlineData: {
        mimeType: mimeDataOrDefault(mimeType),
        data: base64.replace(/^data:image\/[^;]+;base64,/i, ''),
      },
    },
  ]
  const raw = await callGenerate(parts, auth)
  return normalizeExtract(raw)
}

function mimeDataOrDefault(m: string): string {
  if (m.includes('/')) return m
  return 'image/jpeg'
}

function normalizeExtract(raw: string): GeminiExtract {
  const s = stripJsonFence(raw || '{}')
  const data = JSON.parse(s) as Partial<GeminiExtract>
  return {
    word: String(data.word ?? '').slice(0, 200),
    definition: String(data.definition ?? ''),
    hint: String(data.hint ?? ''),
    example: String(data.example ?? ''),
    language_code: String(data.language_code ?? 'en')
      .toLowerCase()
      .slice(0, 8),
  }
}
