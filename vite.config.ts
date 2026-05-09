import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  name: string
}

/** Set `VITE_GITHUB_PAGES=1` when building for `https://<user>.github.io/<repo>/`. */
const useGithubPages = process.env.VITE_GITHUB_PAGES === '1'
const base = useGithubPages ? `/${pkg.name}/` : '/'

const asset = (path: string) => `${base}${path.replace(/^\//, '')}`

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/*.png'],
      manifest: {
        name: 'MindGlass',
        short_name: 'MindGlass',
        description: 'Glassmorphism flashcards with Liteck scheduling',
        theme_color: '#0ea5e9',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: asset('icons/icon-192.png'),
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: asset('icons/icon-512.png'),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: asset('icons/icon-maskable-192.png'),
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: asset('icons/icon-maskable-512.png'),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
})
