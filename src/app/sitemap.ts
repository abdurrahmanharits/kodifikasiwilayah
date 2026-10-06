import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { BASE_URL } from "@/lib/site";

// Google's sitemap limit is 50,000 URLs per file. desa_kelurahan alone has
// ~84k rows, so it's paginated into chunks; id 0 covers everything else
// (homepage + provinsi + kabupaten_kota + kecamatan, ~7.8k URLs combined).
const DESA_CHUNK_SIZE = 40000;

// Supabase caps every request at 1000 rows (db_max_rows) regardless of the
// requested range, so "fetch everything" queries must page internally.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllKode(table: string, from = 0, to = Infinity): Promise<string[]> {
  const kodes: string[] = [];
  let offset = from;

  while (offset <= to) {
    const pageEnd = Math.min(offset + SUPABASE_PAGE_SIZE - 1, to);
    const { data, error } = await supabase.from(table).select("kode").range(offset, pageEnd);
    if (error) throw error;
    if (!data || data.length === 0) break;
    kodes.push(...data.map((d) => d.kode as string));
    if (data.length < pageEnd - offset + 1) break; // fewer rows than asked = exhausted
    offset += SUPABASE_PAGE_SIZE;
  }

  return kodes;
}

export async function generateSitemaps() {
  const { count } = await supabase
    .from("desa_kelurahan")
    .select("*", { count: "exact", head: true });
  const desaChunks = Math.max(1, Math.ceil((count ?? 0) / DESA_CHUNK_SIZE));
  return Array.from({ length: desaChunks + 1 }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const idNum = Number(await id);

  if (idNum === 0) {
    const [provinsiKode, kabupatenKode, kecamatanKode] = await Promise.all([
      fetchAllKode("provinsi"),
      fetchAllKode("kabupaten_kota"),
      fetchAllKode("kecamatan"),
    ]);

    return [
      { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
      ...provinsiKode.map((kode) => ({
        url: `${BASE_URL}/wilayah/${kode}`,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
      ...kabupatenKode.map((kode) => ({
        url: `${BASE_URL}/wilayah/${kode}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
      ...kecamatanKode.map((kode) => ({
        url: `${BASE_URL}/wilayah/${kode}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ];
  }

  const start = (idNum - 1) * DESA_CHUNK_SIZE;
  const end = start + DESA_CHUNK_SIZE - 1;
  const desaKode = await fetchAllKode("desa_kelurahan", start, end);

  return desaKode.map((kode) => ({
    url: `${BASE_URL}/wilayah/${kode}`,
    changeFrequency: "yearly" as const,
    priority: 0.4,
  }));
}
