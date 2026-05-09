/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[]
    prompt(): Promise<void>
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export {}
