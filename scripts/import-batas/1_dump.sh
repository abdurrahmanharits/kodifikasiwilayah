#!/usr/bin/env bash
# Ubah GPKG di db/clear (+ atribut dari file sumbernya) menjadi SQL dump
# yang siap dimuat ke schema import_batas di Supabase.
#
# File di db/clear hanya berisi geometri hasil simplify (atributnya NULL
# karena refactor field di QGIS gagal). Urutan fid-nya identik dengan file
# sebelum simplify, jadi atribut diambil dari sana dan digabung per fid di
# 2_build.sql.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="$ROOT/db"
OUT="$DB/dump"
mkdir -p "$OUT"

pgdump() { # <output.sql> <ogr2ogr args...>
  local out="$1"; shift
  ogr2ogr -f PGDUMP "$OUT/$out" -preserve_fid \
    -lco SCHEMA=import_batas -lco CREATE_SCHEMA=OFF -lco DROP_TABLE=IF_EXISTS \
    -lco FID=fid -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=NONE \
    --config PG_USE_COPY YES "$@"
  echo "OK  $out ($(du -h "$OUT/$out" | cut -f1))"
}

# Geometri desa & kab/kota (hasil simplify).
pgdump desa_src.sql "$DB/clear/batasdesa_clear.gpkg" batasdesa \
  -nln desa_src -select "" -nlt MULTIPOLYGON -a_srs EPSG:4326
pgdump kab_src.sql "$DB/clear/bataskabkot_clear.gpkg" clear \
  -nln kab_src -select "" -nlt MULTIPOLYGON -a_srs EPSG:4326

# Atribut dari file sumber (tanpa geometri).
pgdump desa_attr.sql "$DB/batasdesa_zdrop.gpkg" zm_dropped \
  -nln desa_attr -select KDEPUM,NAMOBJ,REMARK,LUASWH -nlt NONE
pgdump kab_attr.sql "$DB/bataskabkot_clear.gpkg" zm_dropped \
  -nln kab_attr -select KDPKAB,NAMOBJ,LUASWH -nlt NONE
