export type Level = "provinsi" | "kabupaten_kota" | "kecamatan" | "desa_kelurahan";

export const LEVEL_LABELS: Record<Level, string> = {
  provinsi: "Provinsi",
  kabupaten_kota: "Kabupaten/Kota",
  kecamatan: "Kecamatan",
  desa_kelurahan: "Desa/Kelurahan",
};

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
