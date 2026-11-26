"use client";

import { buttonClass } from "@/components/form";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass}>
      Print
    </button>
  );
}
