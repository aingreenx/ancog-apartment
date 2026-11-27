"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/pwa/service-worker";
import { buttonClass } from "./form";

/** Chrome/Edge/Samsung Internet's install event (not in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "ancog:install-dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Install the app" card. Android (Chrome, Edge, Samsung Internet): an Install button.
 * iPhone/iPad Safari: Share → Add to Home Screen. Hidden inside the installed app and
 * once dismissed on this device.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;
    // Decided after mount: the server can't know the device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIos()) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the browser's mini-bar
      setEvent(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: it just shows again next time.
    }
    setMode("hidden");
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    setEvent(null);
    if (outcome === "accepted") setMode("hidden");
  }

  return (
    <aside
      aria-label="Install the app"
      className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-medium">Add Ancog Apartment to your phone</p>
        {mode === "android" ? (
          <>
            <p className="text-zinc-600 dark:text-zinc-400">
              Open it like an app, without the browser bar, and get notifications.
            </p>
            <button type="button" onClick={install} className={`${buttonClass} self-start`}>
              Install app
            </button>
          </>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">
            In Safari, tap <strong>Share</strong> <ShareIcon /> then{" "}
            <strong>Add to Home Screen</strong>. Open it from your Home Screen to get notifications
            (iOS 16.4 or newer).
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Don't show again"
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-emerald-100 dark:hover:bg-emerald-900"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="inline h-4 w-4 align-text-bottom"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
