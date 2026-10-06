import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { CACHE_HEADER, fetchWilayahGeo, parseGeoRequest } from "@/lib/wilayah-geo";

// Higher than search: one search result page fetches several desa outlines,
// and responses are CDN-cached so most repeat requests never reach here.
const RATE_LIMIT = { windowMs: 60_000, max: 120 };

// GET /api/v1/wilayah/{kode}/geojson?isi=batas|kabupaten|kecamatan|desa
// - isi=batas (default): Feature of the wilayah itself
// - isi=kabupaten / kecamatan / desa: FeatureCollection of the outlines below it
// GET /api/v1/wilayah/indonesia/geojson: every provinsi, simplified for the
// national overview map.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/wilayah/[kode]/geojson">) {
  const ip = getClientIp(request.headers);
  const { limited, resetAt } = checkRateLimit(`geojson:${ip}`, RATE_LIMIT);
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString() },
      }
    );
  }

  const { kode } = await ctx.params;

  let result;
  if (kode === "indonesia") {
    result = await supabase.rpc("indonesia_geojson", {}, { get: true });
  } else {
    const parsed = parseGeoRequest(kode, request.nextUrl.searchParams.get("isi"));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message }, { status: 400 });
    }
    result = await fetchWilayahGeo(kode, parsed.isi, false);
  }
  const { data, error } = result;
  if (error) {
    return NextResponse.json({ error: "Gagal mengambil data peta." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Peta untuk wilayah ini belum tersedia." },
      { status: 404, headers: { "Cache-Control": CACHE_HEADER } }
    );
  }

  return NextResponse.json(data, {
    headers: {
      "Content-Type": "application/geo+json",
      "Cache-Control": CACHE_HEADER,
    },
  });
}
