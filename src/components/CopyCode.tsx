"use client";

import { useState } from "react";

export function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600"
    >
      <span>{value}</span>
      <span className="text-xs text-gray-300">{copied ? "Tersalin!" : "Salin"}</span>
    </button>
  );
}
