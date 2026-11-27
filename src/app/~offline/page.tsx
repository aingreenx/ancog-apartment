import type { Metadata } from "next";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline" };

// Shown by the service worker when a page can't load without a connection. Pages and
// balances are never kept offline, so nothing here can be out of date.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Ancog Apartment needs the internet to show bills and payments, so they&apos;re always up to
        date. Check your data or Wi-Fi and try again.
      </p>
      <RetryButton />
    </main>
  );
}
