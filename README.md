# MindGlass

A **local-first** flashcard web app with a glassmorphism-style UI: courses, spaced repetition via **Liteck** (five-box scheduling), streak tracking, and an optional **Google Gemini** assist for importing content. Data lives in **IndexedDB** on your device; the app installs as an **offline-capable PWA**.

## Features

- **Courses** — Organize decks by topic; categories include language, science, coding, exam, and custom.
- **Study modes** — Study Lab round flow plus Liquid Study; sessions can be resumed via browser storage.
- **Scheduling** — Cards move through Liteck boxes; due and “fresh” queues are surfaced per course.
- **Insights** — At-a-glance progress and streak-style feedback after batches.
- **AI import** (optional) — Generate or extract cards from text, documents, or images using Gemini when an API key is configured.
- **Settings** — API key stored in **localStorage** on that browser only (or supply a build-time env key — see below).
- **Deep linking** — URL history tracks tab and study state for back/forward navigation.

## Tech stack

| Area        | Choice                          |
| ----------- | ------------------------------- |
| UI          | React 19, TypeScript, Tailwind CSS 4, Framer Motion |
| Build       | Vite 8                          |
| Local data  | [Dexie](https://dexie.org/) on IndexedDB |
| Docs in app | pdf.js, Mammoth (.docx)         |
| PWA         | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) |
| AI (optional) | Google Gemini API           |

## Requirements

- **Node.js** 22+ (matches the Docker image; newer LTS is fine)
- **npm** (lockfile: `package-lock.json`)

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

| Script        | Purpose                          |
| ------------- | -------------------------------- |
| `npm run dev` | Dev server with HMR              |
| `npm run build` | Typecheck + production bundle  |
| `npm run preview` | Serve the `dist` build locally |
| `npm run lint`  | ESLint                         |

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `VITE_GEMINI_API_KEY` | No | If set at **build** time, it is embedded in the client bundle. Prefer pasting a key in **Settings** so it stays in localStorage for that device only. |
| `VITE_GEMINI_MODEL` | No | Override the default text model (see `src/lib/gemini.ts`). |
| `VITE_GEMINI_IMAGE_MODEL` | No | Override the vision model for image-based import. |

**Privacy note:** Without a Gemini key, AI import is unavailable; all flashcards and progress remain on-device. When you use Gemini, prompts and content are sent to Google’s API under their terms.

## Docker

Build a static site and serve it with nginx:

```bash
docker compose up --build
```

The app is exposed on **port 3001** (mapped to container port 80). Pass `VITE_GEMINI_API_KEY` to the build if you want a baked-in key (not recommended for shared images).

## PWA

Install from the browser (“Add to Home Screen” / install prompt). The service worker caches static assets; runtime rules may cache Google Fonts. Service worker behavior is enabled in development as well for easier testing (`devOptions.enabled` in `vite.config.ts`).

## Project layout (high level)

- `src/App.tsx` — Shell: tabs, course routing, study session wiring, Gemini auth context.
- `src/components/` — UI: courses, study modes, settings, import modal, onboarding.
- `src/db/` — Dexie schema, `Course` and `FlashCard` types, queries.
- `src/lib/` — Gemini client, image shrinking, speech, session storage, streaks, history helpers.

## License

Private project (`"private": true` in `package.json`). Add a license file if you open-source the repo.
