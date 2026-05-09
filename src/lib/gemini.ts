/** Gemini client + MindGlass-style import (aligned with Flutter ai_orchestrator). */

export type GeminiAuth = { apiKey?: string | null }

export type MindGlassImportContext = {
  courseName: string
  courseCategory: string
  goalText?: string | null
}

export type LearningGoal = 'beginner' | 'advanced' | 'examPrep'

export type ExtractedTerm = {
  word: string
  definition: string
  hint?: string | null
  example?: string | null
  categoryTag: string
  languageCode: string
}

export type DocumentDiscovery = {
  sourceLang: string
  targetLang: string
  topic: string
  intent: string
}

type GenPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string
        data: string
      }
    }

/** Defaults match Flutter `RemoteAiModels.flash` (`lib/core/constants/remote_ai_models.dart`). */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'

const TEXT_MODEL =
  (typeof import.meta.env.VITE_GEMINI_MODEL === 'string' && import.meta.env.VITE_GEMINI_MODEL.trim()) ||
  DEFAULT_GEMINI_MODEL

/** Same model as text for vision, unless `VITE_GEMINI_IMAGE_MODEL` is set (Flutter uses one model for both). */
const IMAGE_MODEL =
  (typeof import.meta.env.VITE_GEMINI_IMAGE_MODEL === 'string' &&
    import.meta.env.VITE_GEMINI_IMAGE_MODEL.trim()) ||
  TEXT_MODEL

/** Flutter `AiOrchestrator._ocrVocabUserPrompt` */
const OCR_VOCAB_USER_PROMPT =
  'Extract vocabulary from this image as a JSON array only. ' +
  'Each object MUST include non-empty "hint" and non-empty "example". ' +
  'Format: [{"word":"...","definition":"...","hint":"...","example":"...","language_code":"..."}]. ' +
  'hint: English memory nudge; do not repeat the exact term from "word". ' +
  'example: one short sentence entirely in the same language as "word" (L2); no English in example. ' +
  'language_code: BCP-47 or "".'

const DISCOVERY_SYSTEM =
  'Analyze this text. Identify the source language, target language, and the general topic. ' +
  'The text may be a simple bilingual vocabulary list (one pair per line), e.g. L2 term then a hyphen, en-dash, or colon then the L1 meaning—' +
  'still infer source_lang and target_lang (e.g. Swedish / English). ' +
  'Return JSON only, no markdown, no extra text: ' +
  '{"source_lang": "...", "target_lang": "...", "topic": "...", "intent": "..."}.'

/** Larger chunks + small overlap = fewer requests (system prompt repeated per request). */
const PLAIN_TEXT_CHUNK_SIZE = 5200
const PLAIN_TEXT_CHUNK_OVERLAP = 80
const DISCOVERY_SAMPLE_CHARS = 1200
/** Pair-list imports: larger batches ⇒ fewer requests (system prompt sent once per batch). */
const ENRICH_PAIRS_PER_CALL = 80

/** Flutter `AiOrchestrator.mindGlassExtractionSystemInstruction` */
function mindGlassExtractionSystemInstruction(courseName: string, courseCategory: string): string {
  const cat = courseCategory.trim() === '' ? 'custom' : courseCategory.trim()
  const cn = courseName.trim() === '' ? 'General study' : courseName.trim()
  const focus = cat === 'language' ? 'word-meaning pairs' : 'term-explanation or Q&A pairs'
  return (
    `Extract ${focus} from this image for course "${cn}" (${cat}). ` +
    'Return a JSON array only: [{"word":"...","definition":"...","hint":"...","example":"...","language_code":"..."}]. ' +
    'For EVERY item you MUST output non-empty "hint" and non-empty "example" strings. ' +
    'hint: clever English memory nudge (max 22 words); do not spell the exact term from "word" ' +
    '(use a synonym, situation, or association—no copy-paste of the term). ' +
    'example: one short natural sentence written entirely in the SAME language as "word" ' +
    '(L2 only—e.g. Swedish term → Swedish sentence, Japanese → Japanese); use the term or a correct inflection; no English in example. ' +
    'language_code: BCP-47 if clear (en-US, sv-SE), else "". No markdown, no commentary.'
  )
}

function mindGlassEnrichPairsSystem(courseName: string, courseCategory: string): string {
  const cat = courseCategory.trim() === '' ? 'custom' : courseCategory.trim()
  const cn = courseName.trim() === '' ? 'General study' : courseName.trim()
  return (
    `Course "${cn}" (${cat}). Input JSON pairs: word+definition only. ` +
    'Output same items: add non-empty hint (English, not the L2 token) and example (short L2 sentence). ' +
    'JSON array only: [{"word","definition","hint","example","language_code","category_tag"}].'
  )
}

function extractSystemForGoal(goal: LearningGoal): string {
  const base =
    'Extract flashcard terms from text. JSON only: [{"word","definition","hint","example","language_code","category_tag"}]. ' +
    'Non-empty hint (English; do not paste "word") and example (L2 sentence only). Short category_tag theme.'
  switch (goal) {
    case 'beginner':
      return `${base} Simple definitions.`
    case 'advanced':
      return `${base} Precise definitions; nuance OK.`
    case 'examPrep':
      return `${base} Exam-style wording.`
    default:
      return base
  }
}

function intentChunkSystem(d: DocumentDiscovery, goal: LearningGoal): string {
  const base =
    `Learner: ${d.sourceLang}→${d.targetLang}, ${d.topic} (${d.intent}). ` +
    'Extract vocab from chunk; skip headers/boilerplate. JSON only: ' +
    '[{"word","definition","hint","example","language_code","category_tag":"#Theme"}]. ' +
    'Non-empty hint (English; not the L2 word) and example (L2). List rows "w – d" → one object each.'
  switch (goal) {
    case 'beginner':
      return `${base} Short defs.`
    case 'advanced':
      return `${base} Nuanced defs OK.`
    case 'examPrep':
      return `${base} Test-style defs.`
    default:
      return base
  }
}

function genericEnrichPairsSystem(goal: LearningGoal): string {
  const tone =
    goal === 'beginner'
      ? 'Plain hints.'
      : goal === 'examPrep'
        ? 'Test-focused hints.'
        : 'Clear hints.'
  return (
    `Input: JSON array of {"word","definition"} only. Add hint+example. ${tone} ` +
    'JSON only: [{"word","definition","hint","example","language_code","category_tag"}].'
  )
}

function discoveryEnrichPairsSystem(d: DocumentDiscovery, goal: LearningGoal): string {
  return `Context: ${d.sourceLang}→${d.targetLang}, ${d.topic}. ${genericEnrichPairsSystem(goal)}`
}

function mergeEnrichmentByWord(original: ExtractedTerm[], enriched: ExtractedTerm[]): ExtractedTerm[] {
  const byWord = new Map<string, ExtractedTerm>()
  for (const e of enriched) {
    const k = e.word.trim().toLowerCase()
    if (k) byWord.set(k, e)
  }
  return original.map((o) => {
    const k = o.word.trim().toLowerCase()
    const e = byWord.get(k)
    if (!e) return o
    return {
      ...o,
      hint: e.hint?.trim() || o.hint,
      example: e.example?.trim() || o.example,
      categoryTag: e.categoryTag?.trim() || o.categoryTag,
      languageCode: e.languageCode?.trim() || o.languageCode,
    }
  })
}

type EnrichPairsContext = {
  mindGlass: MindGlassImportContext | null
  discovery: DocumentDiscovery | null
  goal: LearningGoal
  useDiscoveryPath: boolean
}

function enrichPairsSystem(ctx: EnrichPairsContext): string {
  if (ctx.mindGlass != null) {
    return mindGlassEnrichPairsSystem(ctx.mindGlass.courseName, ctx.mindGlass.courseCategory)
  }
  if (ctx.useDiscoveryPath && ctx.discovery != null) {
    return discoveryEnrichPairsSystem(ctx.discovery, ctx.goal)
  }
  return genericEnrichPairsSystem(ctx.goal)
}

async function enrichVocabPairsInBatches(
  pairs: ExtractedTerm[],
  auth: GeminiAuth,
  ctx: EnrichPairsContext,
  goalLine: string,
): Promise<ExtractedTerm[]> {
  const sys = enrichPairsSystem(ctx)
  let merged = pairs
  for (let i = 0; i < pairs.length; i += ENRICH_PAIRS_PER_CALL) {
    const slice = pairs.slice(i, i + ENRICH_PAIRS_PER_CALL)
    const payload = JSON.stringify(
      slice.map((p) => ({
        word: p.word,
        definition: p.definition,
      })),
    )
    const userText = `pairs:${payload}${goalLine}`
    try {
      const raw = await callGenerate([{ text: userText }], auth, {
        systemInstruction: sys,
        maxOutputTokens: 4096,
      })
      if (!raw.trim()) continue
      const parsed = parseTermList(raw, null)
      if (parsed.length === 0) continue
      merged = mergeEnrichmentByWord(merged, parsed)
    } catch {
      /* keep un-enriched for this batch */
    }
  }
  return merged
}

const VOCAB_PAIR_LINE = /^(.+?)\s*[-–—:\u2013\u2014]\s*(.+)$/

function stripInvisible(s: string): string {
  if (!s) return s
  return s.replaceAll('\uFEFF', '').replaceAll('\u00A0', ' ').replaceAll('\u202F', ' ')
}

function stripJsonFence(s: string): string {
  const t = s.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim()
  }
  return t
}

function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

async function callGenerate(
  parts: GenPart[],
  auth: GeminiAuth,
  options: { systemInstruction?: string; maxOutputTokens?: number; model?: string } = {},
): Promise<string> {
  const model = (options.model?.trim() || TEXT_MODEL).trim()
  const url = endpoint(model)
  const genCfg: Record<string, unknown> = {
    temperature: 0.2,
    responseMimeType: 'application/json',
  }
  if (options.maxOutputTokens != null && options.maxOutputTokens > 0) {
    genCfg.maxOutputTokens = options.maxOutputTokens
  }
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: genCfg,
  }
  if (options.systemInstruction?.trim()) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction.trim() }] }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = auth.apiKey?.trim()
  if (key) {
    headers['x-goog-api-key'] = key
  } else {
    throw new Error('Add a Gemini API key in Settings (from Google AI Studio).')
  }
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
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

function normalizeTermKeys(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const nk = k.toLowerCase().trim().replaceAll('-', '_')
    out[nk] = v === null || v === undefined ? '' : String(v)
  }
  return out as Record<string, string>
}

function pickHint(m: Record<string, string>): string | null {
  for (const k of [
    'hint',
    'memory_hint',
    'memory_nudge',
    'mnemonic',
    'nudge',
    'study_hint',
    'hint_text',
    'memory_tip',
  ]) {
    const v = m[k]?.trim()
    if (v) return v
  }
  return null
}

function pickExample(m: Record<string, string>): string | null {
  for (const k of [
    'example',
    'sample_sentence',
    'sentence',
    'usage_example',
    'example_sentence',
    'context',
    'l2_example',
    'usage',
    'sample',
  ]) {
    const v = m[k]?.trim()
    if (v) return v
  }
  return null
}

/** Only drop hint if it is essentially the same token as the word (not substring overlaps). */
function hintIsRedundantWordCopy(hint: string, word: string): boolean {
  const w = word.trim().toLowerCase()
  const h = hint.trim().toLowerCase()
  if (!w || !h) return false
  return w === h || h === w
}

export function parseTermList(raw: string, originalText?: string | null): ExtractedTerm[] {
  const normalized = stripJsonFence(stripInvisible(raw))
  const tryArray = (slice: string): ExtractedTerm[] => {
    const out: ExtractedTerm[] = []
    try {
      const parsed = JSON.parse(slice) as unknown
      let decoded: unknown = parsed

      const unwrapSingleWrapperArray = (v: unknown): unknown => {
        if (!Array.isArray(v) || v.length !== 1) return v
        const only = v[0]
        if (!only || typeof only !== 'object') return v
        const o = only as Record<string, unknown>
        if (Object.keys(o).length === 1) {
          const inner = o[Object.keys(o)[0]!]
          if (Array.isArray(inner)) return inner
        }
        for (const key of ['items', 'terms', 'flashcards', 'vocabulary', 'cards', 'data', 'results', 'entries']) {
          const arr = o[key]
          if (Array.isArray(arr)) return arr
        }
        return v
      }

      decoded = unwrapSingleWrapperArray(decoded)

      if (!Array.isArray(decoded) && decoded && typeof decoded === 'object') {
        const o = decoded as Record<string, unknown>
        for (const key of [
          'items',
          'terms',
          'flashcards',
          'vocabulary',
          'cards',
          'data',
          'results',
          'entries',
        ]) {
          const arr = o[key]
          if (Array.isArray(arr)) {
            decoded = arr
            break
          }
        }
      }

      if (!Array.isArray(decoded)) return out

      for (const e of decoded) {
        if (!e || typeof e !== 'object') continue
        const rawObj = e as Record<string, unknown>
        const m = normalizeTermKeys(rawObj)
        const wordOut =
          m.word?.trim() ||
          m.term?.trim() ||
          m.front?.trim() ||
          m.phrase?.trim() ||
          ''
        const defOut =
          m.definition?.trim() ||
          m.meaning?.trim() ||
          m.back?.trim() ||
          m.translation?.trim() ||
          m.answer?.trim() ||
          ''
        if (!wordOut || !defOut) continue

        let hint = pickHint(m)
        if (hint && hintIsRedundantWordCopy(hint, wordOut)) hint = null
        const example = pickExample(m)
        let tag = m.category_tag?.trim()
        if (!tag) tag = 'General'
        const lc = m.language_code?.trim() ?? ''
        out.push({
          word: wordOut,
          definition: defOut,
          hint,
          example,
          categoryTag: tag,
          languageCode: lc,
        })
      }
    } catch {
      return []
    }
    return out
  }

  let fromJson: ExtractedTerm[] = []
  const start = normalized.indexOf('[')
  const end = normalized.lastIndexOf(']')
  if (start >= 0 && end > start) {
    fromJson = tryArray(normalized.slice(start, end + 1))
  }
  if (fromJson.length === 0) {
    const oStart = normalized.indexOf('{')
    const oEnd = normalized.lastIndexOf('}')
    if (oStart >= 0 && oEnd > oStart) {
      fromJson = tryArray(`[${normalized.slice(oStart, oEnd + 1)}]`)
    }
  }
  if (fromJson.length > 0) return fromJson
  const orig = originalText?.trim() ?? ''
  if (orig) {
    const fb = regexFallbackVocabPairs(orig)
    if (fb.length > 0) return fb
  }
  return fromJson
}

export function regexFallbackVocabPairs(text: string): ExtractedTerm[] {
  const seen = new Set<string>()
  const out: ExtractedTerm[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripInvisible(rawLine.trim())
    if (!line) continue
    const m = VOCAB_PAIR_LINE.exec(line)
    if (!m) continue
    const w = m[1]!.trim()
    const d = m[2]!.trim()
    if (!w || !d) continue
    const k = w.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      word: w,
      definition: d,
      hint: null,
      example: null,
      categoryTag: 'General',
      languageCode: '',
    })
  }
  return out
}

export function chunkIsPairDominant(chunk: string): boolean {
  const lines = chunk
    .split(/\r?\n/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
  if (lines.length < 3) return false
  let pairs = 0
  for (const l of lines) {
    if (VOCAB_PAIR_LINE.test(l)) pairs++
  }
  return pairs >= Math.ceil(lines.length * 0.7)
}

export function chunkPlainText(
  text: string,
  chunkSize = PLAIN_TEXT_CHUNK_SIZE,
  overlap = PLAIN_TEXT_CHUNK_OVERLAP,
): string[] {
  const t = text.trim()
  if (t.length <= chunkSize) return t ? [t] : []
  const out: string[] = []
  let start = 0
  while (start < t.length) {
    const end = Math.min(start + chunkSize, t.length)
    out.push(t.slice(start, end))
    if (end >= t.length) break
    start = Math.max(0, end - overlap)
  }
  return out
}

function structuredVocabDiscovery(sample: string): DocumentDiscovery | null {
  const lines = sample
    .split(/\r?\n/)
    .map((e) => stripInvisible(e.trim()))
    .filter((e) => e.length > 0)
  if (lines.length < 3) return null
  let pairs = 0
  for (const l of lines) {
    if (VOCAB_PAIR_LINE.test(l)) pairs++
  }
  if (pairs < Math.ceil(lines.length * 0.7)) return null
  return {
    sourceLang: 'Source',
    targetLang: 'Target',
    topic: 'Vocabulary',
    intent: 'Word–definition list',
  }
}

function discoveryFromMap(map: Record<string, unknown>): DocumentDiscovery | null {
  const s = (k: string) => stripInvisible(String(map[k] ?? '').trim())
  const src = s('source_lang') || s('sourceLang')
  const tgt = s('target_lang') || s('targetLang')
  const topic = s('topic')
  const intent = s('intent')
  if (!topic && !intent && !src && !tgt) return null
  return {
    sourceLang: src || 'Unknown',
    targetLang: tgt || 'Unknown',
    topic: topic || 'general study',
    intent: intent || 'Vocabulary learning',
  }
}

function parseDiscovery(raw: string): DocumentDiscovery | null {
  let text = stripJsonFence(stripInvisible(raw)).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const map = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      return discoveryFromMap(map)
    } catch {
      try {
        const map = JSON.parse(text) as Record<string, unknown>
        return discoveryFromMap(map)
      } catch {
        return null
      }
    }
  }
  try {
    const map = JSON.parse(text) as Record<string, unknown>
    return discoveryFromMap(map)
  } catch {
    return null
  }
}

export async function discoverDocumentIntent(sample: string, auth: GeminiAuth): Promise<DocumentDiscovery | null> {
  const trimmed = sample.trim()
  if (!trimmed) return null
  const structured = structuredVocabDiscovery(trimmed)
  if (structured) return structured
  try {
    const raw = await callGenerate([{ text: trimmed }], auth, {
      systemInstruction: DISCOVERY_SYSTEM,
      maxOutputTokens: 256,
    })
    if (!raw.trim()) return null
    return parseDiscovery(raw)
  } catch {
    return null
  }
}

export async function extractVocabularyFromImage(
  imageBytes: ArrayBuffer,
  mimeType: string,
  auth: GeminiAuth,
  mindGlass: MindGlassImportContext | null,
): Promise<ExtractedTerm[]> {
  const u8 = new Uint8Array(imageBytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  const base64 = btoa(binary)
  const user =
    mindGlass != null ? 'Extract learning units from this image.' : OCR_VOCAB_USER_PROMPT
  const sys =
    mindGlass != null
      ? mindGlassExtractionSystemInstruction(
          mindGlass.courseName.trim() === '' ? 'Photo import' : mindGlass.courseName.trim(),
          mindGlass.courseCategory,
        )
      : undefined
  const parts: GenPart[] = [
    { text: user },
    {
      inlineData: {
        mimeType: mimeDataOrDefault(mimeType),
        data: base64,
      },
    },
  ]
  const raw = await callGenerate(parts, auth, {
    ...(sys ? { systemInstruction: sys } : {}),
    maxOutputTokens: 8192,
    model: IMAGE_MODEL,
  })
  if (!raw.trim()) return []
  return parseTermList(raw, null)
}

async function extractFlashcardCandidatesChunk(
  chunk: string,
  auth: GeminiAuth,
  goal: LearningGoal,
  mindGlass: MindGlassImportContext | null,
): Promise<ExtractedTerm[]> {
  const trimmed = chunk.trim()
  if (!trimmed) return []
  const goalLine =
    mindGlass?.goalText != null && mindGlass.goalText.trim() !== ''
      ? `\nLearner goal: ${mindGlass.goalText.trim()}`
      : ''
  if (chunkIsPairDominant(trimmed)) {
    const basePairs = regexFallbackVocabPairs(trimmed)
    if (basePairs.length > 0) {
      return enrichVocabPairsInBatches(basePairs, auth, {
        mindGlass,
        discovery: null,
        goal,
        useDiscoveryPath: false,
      }, goalLine)
    }
  }
  const sys =
    mindGlass != null
      ? mindGlassExtractionSystemInstruction(
          mindGlass.courseName.trim() === '' ? 'General study' : mindGlass.courseName.trim(),
          mindGlass.courseCategory,
        )
      : extractSystemForGoal(goal)
  const raw = await callGenerate([{ text: `Text:\n${chunk}${goalLine}` }], auth, {
    systemInstruction: sys,
    maxOutputTokens: 6144,
  })
  if (!raw.trim()) return regexFallbackVocabPairs(chunk)
  const parsed = parseTermList(raw, chunk)
  if (parsed.length === 0 && chunkIsPairDominant(trimmed)) return regexFallbackVocabPairs(trimmed)
  return parsed
}

async function extractChunkWithDiscovery(
  chunk: string,
  discovery: DocumentDiscovery,
  goal: LearningGoal,
  mindGlass: MindGlassImportContext | null,
  auth: GeminiAuth,
): Promise<ExtractedTerm[]> {
  const trimmed = chunk.trim()
  if (!trimmed) return []
  const cn =
    mindGlass?.courseName.trim() && mindGlass.courseName.trim().length > 0
      ? mindGlass.courseName.trim()
      : discovery.topic
  const cc = mindGlass?.courseCategory ?? 'custom'
  const goalLine =
    mindGlass?.goalText != null && mindGlass.goalText.trim() !== ''
      ? `\nLearner goal: ${mindGlass.goalText.trim()}`
      : ''
  if (chunkIsPairDominant(trimmed)) {
    const basePairs = regexFallbackVocabPairs(trimmed)
    if (basePairs.length > 0) {
      return enrichVocabPairsInBatches(basePairs, auth, {
        mindGlass,
        discovery,
        goal,
        useDiscoveryPath: true,
      }, goalLine)
    }
  }
  const sys =
    mindGlass != null ? mindGlassExtractionSystemInstruction(cn, cc) : intentChunkSystem(discovery, goal)
  const raw = await callGenerate([{ text: `Text chunk:\n${chunk}${goalLine}` }], auth, {
    systemInstruction: sys,
    maxOutputTokens: 6144,
  })
  if (!raw.trim()) return regexFallbackVocabPairs(chunk)
  const parsed = parseTermList(raw, chunk)
  if (parsed.length === 0 && chunkIsPairDominant(trimmed)) return regexFallbackVocabPairs(trimmed)
  return parsed
}

export async function extractTermsFromPlainText(
  fullText: string,
  auth: GeminiAuth,
  options: {
    mindGlass: MindGlassImportContext | null
    learningGoal: LearningGoal
    onProgress?: (stage: string) => void
  },
): Promise<ExtractedTerm[]> {
  const text = fullText.trim()
  if (!text) return []

  options.onProgress?.('Understanding document…')
  const sample = text.slice(0, DISCOVERY_SAMPLE_CHARS)
  const fullDocPairList = chunkIsPairDominant(text)

  let discovery: DocumentDiscovery | null = null
  if (fullDocPairList) {
    discovery = structuredVocabDiscovery(text)
  }
  if (!discovery) {
    discovery = structuredVocabDiscovery(sample)
  }
  if (!discovery) {
    discovery = await discoverDocumentIntent(sample, auth)
  }
  if (!discovery) {
    discovery = {
      sourceLang: 'Unknown',
      targetLang: 'Unknown',
      topic: 'general study',
      intent: 'Vocabulary',
    }
  }

  /** Whole file is a vocab list: parse once + enrich only (no per-chunk extraction calls). */
  if (fullDocPairList) {
    const basePairs = regexFallbackVocabPairs(text)
    if (basePairs.length > 0) {
      options.onProgress?.('Adding hints & examples…')
      const goalLine =
        options.mindGlass?.goalText != null && options.mindGlass.goalText.trim() !== ''
          ? `\nLearner goal: ${options.mindGlass.goalText.trim()}`
          : ''
      const useDiscoveryPath = options.mindGlass == null
      return enrichVocabPairsInBatches(basePairs, auth, {
        mindGlass: options.mindGlass,
        discovery,
        goal: options.learningGoal,
        useDiscoveryPath,
      }, goalLine)
    }
  }

  const chunks = chunkPlainText(text)
  const seen = new Set<string>()
  const out: ExtractedTerm[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    options.onProgress?.(`Extracting section ${i + 1} of ${chunks.length}…`)
    let terms: ExtractedTerm[]
    if (mindGlassUsesChunkPath(options.mindGlass)) {
      terms = await extractChunkWithDiscovery(chunk, discovery, options.learningGoal, options.mindGlass, auth)
    } else {
      terms = await extractFlashcardCandidatesChunk(chunk, auth, options.learningGoal, options.mindGlass)
    }
    for (const t of terms) {
      const k = t.word.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
  }

  return out
}

function mindGlassUsesChunkPath(m: MindGlassImportContext | null): boolean {
  if (!m) return false
  return m.courseName.trim().length > 0
}

function mimeDataOrDefault(m: string): string {
  if (m.includes('/')) return m
  return 'image/jpeg'
}
