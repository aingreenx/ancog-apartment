"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/lib/notifications/actions";
import { secondaryButtonClass, buttonClass } from "./form";

type State = "loading" | "unsupported" | "ios-home-screen" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turn phone notifications on or off for this device. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
        setState(ios && !standalone ? "ios-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { ok } = await savePushSubscription(json);
      setState(ok ? "on" : "off");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-medium">Phone notifications</p>
      {state === "loading" && <p className="text-zinc-500">Checking…</p>}
      {state === "unsupported" && (
        <p className="text-zinc-500">This browser can&apos;t show notifications.</p>
      )}
      {state === "ios-home-screen" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          On iPhone: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open the
          app from your Home Screen and turn notifications on there (needs iOS 16.4 or newer).
        </p>
      )}
      {state === "denied" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          Notifications are blocked. Allow them for this site in your browser settings.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">
            Get bills, reminders and payment updates on this device.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className={`${buttonClass} self-start text-sm`}
          >
            {busy ? "Turning on…" : "Turn on"}
          </button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-emerald-700 dark:text-emerald-400">On for this device.</p>
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className={`${secondaryButtonClass} self-start`}
          >
            Turn off
          </button>
        </>
      )}
    </div>
  );
}
