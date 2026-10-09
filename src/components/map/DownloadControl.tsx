"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { LEVEL_LABELS, LEVELS, SHP_LEVELS, SLUG_OF_LEVEL, type Level } from "@/lib/wilayah";

type Props = {
  kode: string;
  level: Level;
  nama: string;
  // False while the outline is loading or when the wilayah has none.
  hasGeom: boolean;
};

// Download button in the map's bottom-right corner, stacked above the zoom
// control. Rendered as a real Leaflet control so it lines up with the other
// controls and clicks on it never pan or zoom the map.
export function DownloadControl({ kode, level, nama, hasGeom }: Props) {
  const map = useMap();
  const [container] = useState(() => {
    const div = L.DomUtil.create("div", "relative");
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const Control = L.Control.extend({ onAdd: () => container });
    const control = new Control({ position: "bottomright" });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, container]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!container.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, container]);

  // The wilayah itself plus every level below it.
  const rows = LEVELS.slice(LEVELS.indexOf(level));

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Unduh data wilayah"
        aria-expanded={open}
        title="Unduh data wilayah"
        className="flex h-24 w-24 items-center justify-center rounded border-2 border-black/20 bg-white bg-clip-padding text-gray-700 hover:bg-gray-50"
      >
        <CloudArrowDownIcon />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-3 max-h-[40dvh] w-[420px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 text-gray-900 shadow-lg md:max-h-[70dvh]">
          <p className="text-sm text-gray-500">Unduh data</p>
          <p className="mt-1 break-words text-xl font-semibold leading-snug">{nama}</p>

          <table className="mt-4 w-full text-base">
            <thead>
              <tr className="text-left text-sm text-gray-500">
                <th className="py-2 pr-3 font-normal">Wilayah</th>
                <th className="py-2 px-1 text-center font-normal">Shapefile</th>
                <th className="py-2 pl-1 text-center font-normal">Kode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((l) => {
                const isSelf = l === level;
                const slug = SLUG_OF_LEVEL[l];
                const shpOk = hasGeom && SHP_LEVELS[level].includes(l);
                return (
                  <tr key={l}>
                    <td className="py-3 pr-3 leading-snug">{isSelf ? LEVEL_LABELS[l] : `Semua ${LEVEL_LABELS[l].toLowerCase()}`}</td>
                    <td className="py-3 px-1 text-center">
                      {shpOk ? (
                        <DownloadLink href={`/api/v1/wilayah/${kode}/shp${isSelf ? "" : `?isi=${slug}`}`}>
                          .zip
                        </DownloadLink>
                      ) : (
                        <span
                          className="text-gray-300"
                          title={
                            hasGeom
                              ? "Terlalu besar untuk satu provinsi; unduh per kabupaten/kota."
                              : "Peta batas wilayah ini belum tersedia."
                          }
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-1 text-center">
                      <DownloadLink href={`/api/v1/wilayah/${kode}/csv?isi=${slug}`}>.csv</DownloadLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-4 text-sm leading-relaxed text-gray-500">
            Batas wilayah indikatif BIG edisi Juni 2026. Kecamatan digabung dari batas desa, provinsi dari
            batas kabupaten/kota.
          </p>
        </div>
      )}
    </>,
    container
  );
}

function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  // `!`: Leaflet's `.leaflet-container a` color would otherwise win.
  return (
    <a
      href={href}
      download
      className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-base font-medium text-gray-700! no-underline hover:bg-gray-50"
    >
      {children}
    </a>
  );
}

// Cloud and download arrow stay inside the viewBox at larger sizes.
function CloudArrowDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-14 w-14 shrink-0"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 18H6a4 4 0 0 1-.5-7.97A6.5 6.5 0 0 1 18 8.5a4.75 4.75 0 0 1 0 9.5h-1M12 10v11m-4-4 4 4 4-4"
      />
    </svg>
  );
}
