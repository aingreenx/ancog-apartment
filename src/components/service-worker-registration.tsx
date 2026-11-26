"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/service-worker";

/** Registers the service worker once the page has loaded (production builds only). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => void registerServiceWorker().catch(() => null);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
