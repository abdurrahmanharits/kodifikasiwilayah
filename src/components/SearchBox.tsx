"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEVEL_LABELS, type Level } from "@/lib/wilayah";
import { useMapState } from "@/components/map/MapContext";

const MIN_QUERY_LENGTH = 2;

type NamedCode = { kode: string; nama: string };

type SearchResult = {
  level: Level;
  kode: string;
  nama: string;
  jenis?: string;
  provinsi?: NamedCode;
  kabupaten_kota?: NamedCode;
  kecamatan?: NamedCode;
};

type SearchResponse = {
  query: string;
  count: number;
  results: SearchResult[];
  error?: string;
};

function hierarchyPath(r: SearchResult): string | null {
  const parts: string[] = [];
  if (r.kecamatan) parts.push(`Kec. ${r.kecamatan.nama}`);
  if (r.kabupaten_kota) parts.push(r.kabupaten_kota.nama);
  if (r.provinsi) parts.push(r.provinsi.nama);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSearchKodes, setActiveKode } = useMapState();

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;

  function reset() {
    setResults([]);
    setError(null);
    setLoading(false);
    setSearchKodes([]);
    setActiveKode(null);
  }

  // Short queries are cleared right here rather than in the effect, so the
  // effect only ever sets state from its async callback.
  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) reset();
    else setLoading(true);
  }

  function clear() {
    setQuery("");
    reset();
  }

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data: SearchResponse = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Terjadi kesalahan.");
          setResults([]);
          setSearchKodes([]);
        } else {
          setError(null);
          setResults(data.results);
          // Only desa outlines are cheap enough to draw for every result.
          setSearchKodes(data.results.filter((r) => r.level === "desa_kelurahan").map((r) => r.kode));
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Gagal menghubungi server.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed, searching, setSearchKodes]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Cari nama atau kode wilayah, contoh: Bandung atau 32.02.11"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-500"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Hapus pencarian"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 text-lg leading-none text-gray-400 hover:text-gray-700"
          >
            ×
          </button>
        )}
      </div>

      {searching && (
        <div className="flex max-h-[40dvh] flex-col overflow-y-auto rounded-lg border border-gray-200">
          {loading && <p className="px-3 py-2 text-sm text-gray-400">Mencari...</p>}
          {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">Tidak ada hasil untuk &quot;{trimmed}&quot;.</p>
          )}
          {!loading && results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map((r) => {
                const path = hierarchyPath(r);
                return (
                  <li
                    key={`${r.level}-${r.kode}`}
                    onMouseEnter={() => setActiveKode(r.kode)}
                    onMouseLeave={() => setActiveKode(null)}
                  >
                    <Link
                      href={`/wilayah/${r.kode}`}
                      onClick={clear}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.nama}</p>
                        {path && <p className="truncate text-xs text-gray-500">{path}</p>}
                        <p className="text-xs text-gray-400">{r.kode}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {LEVEL_LABELS[r.level]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
