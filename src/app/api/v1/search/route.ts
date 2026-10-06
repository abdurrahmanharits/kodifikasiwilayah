import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { provinsiCodeOf, kabupatenCodeOf, kecamatanCodeOf } from "@/lib/wilayah";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const RATE_LIMIT = { windowMs: 60_000, max: 30 }; // 30 request/menit per IP

type NamedCode = { kode: string; nama: string };

// Lets users type a code without dots (e.g. "3674") and still find it.
// Segments follow the fixed prov(2).kab(2).kec(2).desa(4) digit layout.
function digitsToDottedKode(digits: string): string {
  const segmentLengths = [2, 2, 2, 4];
  const segments: string[] = [];
  let i = 0;
  for (const len of segmentLengths) {
    if (i >= digits.length) break;
    segments.push(digits.slice(i, i + len));
    i += len;
  }
  return segments.join(".");
}

// Merge two result batches (matched by nama, matched by kode), dedupe by
// kode, and cap to `limit` so a match on both doesn't count twice.
function mergeByKode<T extends { kode: string }>(a: T[], b: T[], limit: number): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!map.has(item.kode)) map.set(item.kode, item);
  }
  return [...map.values()].slice(0, limit);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const { limited, remaining, resetAt } = checkRateLimit(`search:${ip}`, RATE_LIMIT);

  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": String(RATE_LIMIT.max),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Parameter 'q' wajib diisi, minimal ${MIN_QUERY_LENGTH} karakter.` },
      { status: 400 }
    );
  }

  const pattern = `%${q}%`;
  // "3674" -> "36.74" so digit-only input still matches the dotted kode column.
  const kodeQuery = /^\d+$/.test(q) ? digitsToDottedKode(q) : q;
  const kodePattern = `%${kodeQuery}%`;

  const [
    provinsiByNama,
    provinsiByKode,
    kabupatenByNama,
    kabupatenByKode,
    kecamatanByNama,
    kecamatanByKode,
    desaByNama,
    desaByKode,
  ] = await Promise.all([
    supabase.from("provinsi").select("kode,nama").ilike("nama", pattern).limit(limit),
    supabase.from("provinsi").select("kode,nama").ilike("kode", kodePattern).limit(limit),
    supabase
      .from("kabupaten_kota")
      .select("kode,nama,jenis,provinsi_kode")
      .ilike("nama", pattern)
      .limit(limit),
    supabase
      .from("kabupaten_kota")
      .select("kode,nama,jenis,provinsi_kode")
      .ilike("kode", kodePattern)
      .limit(limit),
    supabase
      .from("kecamatan")
      .select("kode,nama,kabupaten_kode")
      .ilike("nama", pattern)
      .limit(limit),
    supabase
      .from("kecamatan")
      .select("kode,nama,kabupaten_kode")
      .ilike("kode", kodePattern)
      .limit(limit),
    supabase
      .from("desa_kelurahan")
      .select("kode,nama,jenis,kecamatan_kode")
      .ilike("nama", pattern)
      .limit(limit),
    supabase
      .from("desa_kelurahan")
      .select("kode,nama,jenis,kecamatan_kode")
      .ilike("kode", kodePattern)
      .limit(limit),
  ]);

  const allResponses = [
    provinsiByNama,
    provinsiByKode,
    kabupatenByNama,
    kabupatenByKode,
    kecamatanByNama,
    kecamatanByKode,
    desaByNama,
    desaByKode,
  ];
  const errored = allResponses.find((r) => r.error);
  if (errored?.error) {
    return NextResponse.json({ error: errored.error.message }, { status: 500 });
  }

  const provinsiRows = mergeByKode(provinsiByNama.data ?? [], provinsiByKode.data ?? [], limit);
  const kabupatenRows = mergeByKode(kabupatenByNama.data ?? [], kabupatenByKode.data ?? [], limit);
  const kecamatanRows = mergeByKode(kecamatanByNama.data ?? [], kecamatanByKode.data ?? [], limit);
  const desaRows = mergeByKode(desaByNama.data ?? [], desaByKode.data ?? [], limit);

  // Collect ancestor codes we need names for, then resolve them in one batch
  // per level instead of cascading queries.
  const provinsiCodes = new Set<string>();
  const kabupatenCodes = new Set<string>();
  const kecamatanCodes = new Set<string>();

  for (const d of kabupatenRows) provinsiCodes.add(d.provinsi_kode);
  for (const d of kecamatanRows) {
    kabupatenCodes.add(d.kabupaten_kode);
    provinsiCodes.add(provinsiCodeOf(d.kode));
  }
  for (const d of desaRows) {
    kecamatanCodes.add(d.kecamatan_kode);
    kabupatenCodes.add(kabupatenCodeOf(d.kode));
    provinsiCodes.add(provinsiCodeOf(d.kode));
  }

  const emptyLookup = Promise.resolve({ data: [] as NamedCode[], error: null });
  const [provinsiLookup, kabupatenLookup, kecamatanLookup] = await Promise.all([
    provinsiCodes.size
      ? supabase.from("provinsi").select("kode,nama").in("kode", [...provinsiCodes])
      : emptyLookup,
    kabupatenCodes.size
      ? supabase.from("kabupaten_kota").select("kode,nama").in("kode", [...kabupatenCodes])
      : emptyLookup,
    kecamatanCodes.size
      ? supabase.from("kecamatan").select("kode,nama").in("kode", [...kecamatanCodes])
      : emptyLookup,
  ]);

  const lookupErrored = [provinsiLookup, kabupatenLookup, kecamatanLookup].find((r) => r.error);
  if (lookupErrored?.error) {
    return NextResponse.json({ error: lookupErrored.error.message }, { status: 500 });
  }

  const provinsiMap = new Map((provinsiLookup.data ?? []).map((d) => [d.kode, d.nama]));
  const kabupatenMap = new Map((kabupatenLookup.data ?? []).map((d) => [d.kode, d.nama]));
  const kecamatanMap = new Map((kecamatanLookup.data ?? []).map((d) => [d.kode, d.nama]));

  const provinsiOf = (kode: string): NamedCode | undefined => {
    const pk = provinsiCodeOf(kode);
    const nama = provinsiMap.get(pk);
    return nama ? { kode: pk, nama } : undefined;
  };
  const kabupatenOf = (kode: string): NamedCode | undefined => {
    const kk = kabupatenCodeOf(kode);
    const nama = kabupatenMap.get(kk);
    return nama ? { kode: kk, nama } : undefined;
  };

  const results = [
    ...provinsiRows.map((d) => ({
      level: "provinsi" as const,
      kode: d.kode,
      nama: d.nama,
    })),
    ...kabupatenRows.map((d) => ({
      level: "kabupaten_kota" as const,
      kode: d.kode,
      nama: d.nama,
      jenis: d.jenis,
      provinsi: provinsiOf(d.kode),
    })),
    ...kecamatanRows.map((d) => ({
      level: "kecamatan" as const,
      kode: d.kode,
      nama: d.nama,
      kabupaten_kota: kabupatenOf(d.kode),
      provinsi: provinsiOf(d.kode),
    })),
    ...desaRows.map((d) => ({
      level: "desa_kelurahan" as const,
      kode: d.kode,
      nama: d.nama,
      jenis: d.jenis,
      kecamatan: kecamatanMap.has(d.kecamatan_kode)
        ? { kode: d.kecamatan_kode, nama: kecamatanMap.get(d.kecamatan_kode)! }
        : undefined,
      kabupaten_kota: kabupatenOf(d.kode),
      provinsi: provinsiOf(d.kode),
    })),
  ];

  return NextResponse.json(
    {
      query: q,
      count: results.length,
      results,
    },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT.max),
        "X-RateLimit-Remaining": String(remaining),
      },
    }
  );
}
