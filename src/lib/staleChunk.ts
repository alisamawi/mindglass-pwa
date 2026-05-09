/** Lazy-loaded chunks 404 after a deploy while an old tab keeps running in memory. */
export function isLikelyStaleChunkLoadError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return (
    /Failed to fetch dynamically imported module/i.test(m) ||
    /Loading chunk \d+ failed/i.test(m) ||
    /error loading dynamically imported module/i.test(m) ||
    /Importing a module script failed/i.test(m)
  )
}

export function staleChunkUserMessage(): string {
  return 'This tab was open when MindGlass was updated, so some files are out of date. Refresh the page (pull down in Safari, or close every MindGlass tab and open the site again), then try importing the file once more.'
}
