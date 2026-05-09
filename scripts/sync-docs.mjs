/**
 * Copies production build into docs/ for GitHub Pages (Branch → /docs).
 */
import { cpSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const docs = join(root, 'docs')

rmSync(docs, { recursive: true, force: true })
mkdirSync(docs, { recursive: true })
cpSync(dist, docs, { recursive: true })
copyFileSync(join(docs, 'index.html'), join(docs, '404.html'))
writeFileSync(join(docs, '.nojekyll'), '')
