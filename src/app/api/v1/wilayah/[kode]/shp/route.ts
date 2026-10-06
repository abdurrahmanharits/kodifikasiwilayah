import { NextRequest, NextResponse } from "next/server";
import { write as writeShapefile } from "@mapbox/shp-write";
import JSZip from "jszip";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { Level } from "@/lib/wilayah";
import {
  CACHE_HEADER,
  fetchWilayahGeo,
  parseGeoRequest,
  type WilayahCollection,
  type WilayahFeature,
} from "@/lib/wilayah-geo";

// Tighter than the GeoJSON endpoint: each download builds a zip in memory.
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

const FILE_PREFIX: Record<Level, string> = {
  provinsi: "prov",
  kabupaten_kota: "kab",
  kecamatan: "kec",
  desa_kelurahan: "desa",
};

// shp-write's DBF writer stores one byte per UTF-16 code unit, so anything
// outside ASCII would be mangled. Fold accents (é -> e) and drop the rest;
// the .cpg then honestly declares UTF-8 (ASCII is a subset of it).
function toAscii(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

function slug(value: string): string {
  return toAscii(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// DBF field names are capped at 10 characters, and every row must share
// the same fields, so pick the set from the features' level.
function toRow(f: WilayahFeature): Record<string, string | number> {
  const p = f.properties;
  if (p.level === "desa_kelurahan") {
    return { kode: p.kode, nama: toAscii(p.nama), jenis: toAscii(p.jenis), sumber: toAscii(p.sumber) };
  }
  const row: Record<string, string | number> = { kode: p.kode, nama: toAscii(p.nama) };
  if (p.level === "kabupaten_kota") row.jenis = toAscii(p.jenis);
  row.desa_peta = p.desa_terpetakan ?? 0;
  row.desa_total = p.desa_total ?? 0;
  return row;
}

// GET /api/v1/wilayah/{kode}/shp?isi=batas|kecamatan|desa
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/wilayah/[kode]/shp">) {
  const ip = getClientIp(request.headers);
  const { limited, resetAt } = checkRateLimit(`shp:${ip}`, RATE_LIMIT);
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
  const parsed = parseGeoRequest(kode, request.nextUrl.searchParams.get("isi"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  // forShapefile: rings come back oriented the shapefile way (outer
  // clockwise, holes counter-clockwise) via ST_ForcePolygonCW.
  const { data, error } = await fetchWilayahGeo(kode, parsed.isi, true);
  if (error) {
    return NextResponse.json({ error: "Gagal mengambil data peta." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Peta untuk wilayah ini belum tersedia." },
      { status: 404, headers: { "Cache-Control": CACHE_HEADER } }
    );
  }

  const geo = data as WilayahFeature | WilayahCollection;
  const features = geo.type === "FeatureCollection" ? geo.features : [geo];
  const namaWilayah = geo.type === "FeatureCollection" ? geo.wilayah.nama : geo.properties.nama;
  const isiSuffix = parsed.isi === "batas" ? "" : `_semua_${parsed.isi}`;
  const baseName = `${FILE_PREFIX[parsed.level]}_${kode.replaceAll(".", "_")}_${slug(namaWilayah)}${isiSuffix}`;

  const zip = new JSZip();
  writeShapefile(
    features.map(toRow),
    "POLYGON",
    features.map((f) => f.geometry.coordinates),
    (err, files) => {
      if (err) throw err;
      zip.file(`${baseName}.shp`, files.shp.buffer);
      zip.file(`${baseName}.shx`, files.shx.buffer);
      zip.file(`${baseName}.dbf`, files.dbf.buffer);
    }
  );
  zip.file(`${baseName}.prj`, WGS84_PRJ);
  zip.file(`${baseName}.cpg`, "UTF-8");

  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return new NextResponse(body as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}.zip"`,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
