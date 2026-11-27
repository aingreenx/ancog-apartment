"use client";

import { buttonClass } from "@/components/form";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className={`${buttonClass} self-center`}
    >
      Try again
    </button>
  );
}
