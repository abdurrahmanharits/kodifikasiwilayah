export type Level = "provinsi" | "kabupaten_kota" | "kecamatan" | "desa_kelurahan";

export const LEVEL_LABELS: Record<Level, string> = {
  provinsi: "Provinsi",
  kabupaten_kota: "Kabupaten/Kota",
  kecamatan: "Kecamatan",
  desa_kelurahan: "Desa/Kelurahan",
};

// Top to bottom; a level's index is also its number of kode segments - 1.
export const LEVELS: Level[] = ["provinsi", "kabupaten_kota", "kecamatan", "desa_kelurahan"];

// Short level names used in URLs (`?isi=`) and download file names.
export type LevelSlug = "provinsi" | "kabupaten" | "kecamatan" | "desa";
export const SLUG_OF_LEVEL: Record<Level, LevelSlug> = {
  provinsi: "provinsi",
  kabupaten_kota: "kabupaten",
  kecamatan: "kecamatan",
  desa_kelurahan: "desa",
};

// Which levels' outlines can be downloaded as a shapefile from each level.
// Provinsi stops at kabupaten: every kecamatan/desa in a province can be
// 10+ MB, past the RPC timeout.
export const SHP_LEVELS: Record<Level, Level[]> = {
  provinsi: ["provinsi", "kabupaten_kota"],
  kabupaten_kota: ["kabupaten_kota", "kecamatan", "desa_kelurahan"],
  kecamatan: ["kecamatan", "desa_kelurahan"],
  desa_kelurahan: ["desa_kelurahan"],
};

// Download file names are ASCII: fold accents (é -> e) and drop the rest.
export function toAscii(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

export function slug(value: string): string {
  return toAscii(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// kode is hierarchical: "prov.kab.kec.desa" (e.g. "32.02.11.1001"),
// so both the level and ancestor codes can be derived from the string itself.
export function levelOfKode(kode: string): Level | null {
  switch (kode.split(".").length) {
    case 1:
      return "provinsi";
    case 2:
      return "kabupaten_kota";
    case 3:
      return "kecamatan";
    case 4:
      return "desa_kelurahan";
    default:
      return null;
  }
}

export function provinsiCodeOf(kode: string) {
  return kode.split(".")[0];
}
export function kabupatenCodeOf(kode: string) {
  const [p, k] = kode.split(".");
  return `${p}.${k}`;
}
export function kecamatanCodeOf(kode: string) {
  const [p, k, c] = kode.split(".");
  return `${p}.${k}.${c}`;
}
