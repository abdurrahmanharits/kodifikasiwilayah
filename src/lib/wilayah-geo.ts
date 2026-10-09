import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { supabase } from "@/lib/supabase";
import { levelOfKode, SHP_LEVELS, SLUG_OF_LEVEL, type Level } from "@/lib/wilayah";

// What a geo request returns: the wilayah's own outline ("batas") or the
// outlines of everything one/two levels below it.
export type Isi = "batas" | "kabupaten" | "kecamatan" | "desa";

export type GeoProps = {
  kode: string;
  nama: string;
  level: Level;
  jenis?: string | null;
  sumber?: string | null;
  desa_terpetakan?: number;
  desa_total?: number;
};

export type WilayahFeature = Feature<MultiPolygon, GeoProps>;
export type WilayahCollection = FeatureCollection<MultiPolygon, GeoProps> & {
  wilayah: { kode: string; nama: string };
};

const KODE_PATTERN = /^\d{2}(\.\d{2}(\.\d{2}(\.\d{4})?)?)?$/;

// Which `isi` values make sense for each level: the wilayah's own outline
// is "batas", the levels below it go by their slug.
function allowedIsi(level: Level): Isi[] {
  return SHP_LEVELS[level].map((l) => (l === level ? "batas" : (SLUG_OF_LEVEL[l] as Isi)));
}

export const CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=604800";

export function parseGeoRequest(
  kode: string,
  isiParam: string | null
): { ok: true; level: Level; isi: Isi } | { ok: false; message: string } {
  const level = KODE_PATTERN.test(kode) ? levelOfKode(kode) : null;
  const allowed = level ? allowedIsi(level) : undefined;
  if (!level || !allowed) {
    return {
      ok: false,
      message: "Kode wilayah tidak valid, contoh: 32, 32.02, 32.02.11, atau 32.02.11.1001.",
    };
  }
  const isi = (isiParam ?? "batas") as Isi;
  if (!allowed.includes(isi)) {
    return { ok: false, message: `Parameter 'isi' untuk kode ini harus salah satu dari: ${allowed.join(", ")}.` };
  }
  return { ok: true, level, isi };
}

// `get: true` sends the RPC as a GET so it goes through the Next.js fetch
// cache configured in lib/supabase.ts (POST requests are not cached).
export function fetchWilayahGeo(kode: string, isi: Isi, forShapefile: boolean) {
  return supabase.rpc(
    "wilayah_geojson",
    { p_kode: kode, p_isi: isi, p_shp: forShapefile },
    { get: true }
  );
}
