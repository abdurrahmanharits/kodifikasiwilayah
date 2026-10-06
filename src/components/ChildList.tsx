"use client";

import Link from "next/link";
import { useMapState } from "@/components/map/MapContext";

export type ChildLink = { kode: string; nama: string; jenis?: string };

// Hovering an item highlights the matching polygon on the shared map.
export function ChildList({ items }: { items: ChildLink[] }) {
  const { setActiveKode } = useMapState();
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-100">
      {items.map((c) => (
        <li
          key={c.kode}
          onMouseEnter={() => setActiveKode(c.kode)}
          onMouseLeave={() => setActiveKode(null)}
        >
          <Link
            href={`/wilayah/${c.kode}`}
            onClick={() => setActiveKode(null)}
            className="flex items-center justify-between gap-4 px-3 py-2.5 hover:bg-gray-50"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{c.nama}</span>
              {c.jenis && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  {c.jenis}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-gray-400">{c.kode}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
