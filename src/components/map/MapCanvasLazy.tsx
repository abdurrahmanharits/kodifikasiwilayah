"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import, so the map must skip SSR. `ssr: false`
// is only allowed inside a Client Component, hence this thin wrapper that
// the (server) map layout can import directly.
export const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-200" />,
});
