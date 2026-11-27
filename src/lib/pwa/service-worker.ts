// Client-side helpers for the one service worker (src/app/sw.ts, served at /serwist/sw.js).

export const SW_URL = "/serwist/sw.js";

/** Registers the service worker for the whole site (or returns the existing registration). */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  // The worker is a single bundled file with no imports, so it also runs as a classic
  // worker, which every browser supports.
  return navigator.serviceWorker.register(SW_URL, { scope: "/", type: "classic" });
}

/** True when running as the installed app (Home Screen / app drawer), not in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  // iPadOS reports itself as a Mac; touch support gives it away.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}
