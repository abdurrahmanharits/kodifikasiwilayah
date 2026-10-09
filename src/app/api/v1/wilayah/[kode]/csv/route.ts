import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { CACHE_HEADER } from "@/lib/wilayah-geo";
import { LEVELS, levelOfKode, slug, SLUG_OF_LEVEL, type Level } from "@/lib/wilayah";

// Same budget as the shapefile endpoint: a provinsi's desa list is several
// thousand rows paged out of Supabase.
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const KODE_PATTERN = /^\d{2}(\.\d{2}(\.\d{2}(\.\d{4})?)?)?$/;

// Supabase caps every request at 1000 rows (db_max_rows).
const PAGE_SIZE = 1000;

type Row = { kode: string; nama: string; jenis?: string | null };

const SOURCE: Record<Level, { table: string; columns: string }> = {
  provinsi: { table: "provinsi", columns: "kode,nama" },
  kabupaten_kota: { table: "kabupaten_kota", columns: "kode,nama,jenis" },
  kecamatan: { table: "kecamatan", columns: "kode,nama" },
  desa_kelurahan: { table: "desa_kelurahan", columns: "kode,nama,jenis" },
};

const HAS_JENIS: Partial<Record<Level, boolean>> = { kabupaten_kota: true, desa_kelurahan: true };

// Rows of `level` inside wilayah `kode`: the wilayah itself (or its ancestor)
// when `level` is at or above it, otherwise every descendant at that level.
async function fetchLevel(level: Level, kode: string): Promise<Row[]> {
  const depth = LEVELS.indexOf(level) + 1;
  const segments = kode.split(".");
  const { table, columns } = SOURCE[level];

  if (depth <= segments.length) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("kode", segments.slice(0, depth).join("."));
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  }

  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .like("kode", `${kode}.%`)
      .order("kode")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// GET /api/v1/wilayah/{kode}/csv?isi=provinsi|kabupaten|kecamatan|desa
// One row per wilayah of the requested level inside {kode}, with the kode
// and nama of every level above it.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/wilayah/[kode]/csv">) {
  const ip = getClientIp(request.headers);
  const { limited, resetAt } = checkRateLimit(`csv:${ip}`, RATE_LIMIT);
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak unduhan. Coba lagi sebentar lagi." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString() },
      }
    );
  }

  const { kode } = await ctx.params;
  const level = KODE_PATTERN.test(kode) ? levelOfKode(kode) : null;
  if (!level) {
    return NextResponse.json(
      { error: "Kode wilayah tidak valid, contoh: 32, 32.02, 32.02.11, atau 32.02.11.1001." },
      { status: 400 }
    );
  }

  const ownIndex = LEVELS.indexOf(level);
  const allowed = LEVELS.slice(ownIndex);
  const isiParam = request.nextUrl.searchParams.get("isi") ?? SLUG_OF_LEVEL[level];
  const target = allowed.find((l) => SLUG_OF_LEVEL[l] === isiParam);
  if (!target) {
    return NextResponse.json(
      {
        error: `Parameter 'isi' untuk kode ini harus salah satu dari: ${allowed.map((l) => SLUG_OF_LEVEL[l]).join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // Every level from provinsi down to the target, fetched in parallel; the
  // ones above the target only supply ancestor names.
  const levels = LEVELS.slice(0, LEVELS.indexOf(target) + 1);
  let byLevel: Row[][];
  try {
    byLevel = await Promise.all(levels.map((l) => fetchLevel(l, kode)));
  } catch {
    return NextResponse.json({ error: "Gagal mengambil data wilayah." }, { status: 500 });
  }

  const self = byLevel[ownIndex].find((r) => r.kode === kode);
  if (!self) {
    return NextResponse.json(
      { error: "Wilayah tidak ditemukan." },
      { status: 404, headers: { "Cache-Control": CACHE_HEADER } }
    );
  }

  const ancestors = levels.slice(0, -1);
  const namaOf = ancestors.map((_, i) => new Map(byLevel[i].map((r) => [r.kode, r.nama])));

  const header = ["kode", "nama"];
  if (HAS_JENIS[target]) header.push("jenis");
  for (const l of ancestors) header.push(`kode_${SLUG_OF_LEVEL[l]}`, `nama_${SLUG_OF_LEVEL[l]}`);

  const lines = [header.join(",")];
  for (const row of byLevel[levels.length - 1]) {
    const cells: (string | null | undefined)[] = [row.kode, row.nama];
    if (HAS_JENIS[target]) cells.push(row.jenis);
    const segments = row.kode.split(".");
    ancestors.forEach((_, i) => {
      const k = segments.slice(0, i + 1).join(".");
      cells.push(k, namaOf[i].get(k));
    });
    lines.push(cells.map(csvCell).join(","));
  }

  // e.g. kode_desa_32_02_kabupaten_sukabumi.csv
  const fileName = `kode_${SLUG_OF_LEVEL[target]}_${kode.replaceAll(".", "_")}_${slug(self.nama)}.csv`;

  // BOM so Excel opens the UTF-8 names (e.g. accented desa) correctly.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
