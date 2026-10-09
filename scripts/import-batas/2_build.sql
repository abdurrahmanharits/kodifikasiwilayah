-- Bangun tabel geometri baru di schema import_batas dari dump 1_dump.sh.
-- Hierarki:
--   desa      = db/clear/batasdesa_clear.gpkg (digabung per kode)
--   kecamatan = dissolve desa
--   kab/kota  = db/clear/bataskabkot_clear.gpkg (digabung per kode)
--   provinsi  = dissolve kab/kota
-- Tabel public belum disentuh; pertukaran ada di 3_swap.sql.
\set ON_ERROR_STOP on
set statement_timeout = 0;
set search_path = import_batas, public, extensions;

-- Celah tipis antar poligon tetangga (akibat simplify per fitur) menjadi
-- lubang setelah dissolve. Lubang di bawah ~1 ha (1e-6 deg²) dibuang;
-- danau/enklave yang lebih besar tetap.
\set min_hole 1e-6

\echo '== desa'
drop table if exists import_batas.desa_geom;
create table desa_geom as
with src as (
  select a.kdepum as kode,
         st_collectionextract(st_makevalid(s.geom), 3) as geom,
         -- REMARK: "Batas Indikatif | - | <sumber> | <catatan>..."
         nullif(trim(split_part(a.remark, '|', 3)), '-') as sumber
    from desa_src s
    join desa_attr a using (fid)
   -- Kode kosong = pulau/area yang belum dialokasikan ke desa mana pun.
   where a.kdepum ~ '^\d{2}\.\d{2}\.\d{2}\.\d{4}$'
)
select kode,
       st_multi(st_collectionextract(st_makevalid(st_union(geom)), 3))::geometry(MultiPolygon, 4326) as geom,
       (array_agg(sumber order by st_area(geom) desc) filter (where sumber is not null))[1] as sumber
  from src
 group by kode;
alter table desa_geom add primary key (kode);
create index on desa_geom using gist (geom);
-- Bebaskan ruang sebelum dissolve (kuota DB free tier 500 MB).
drop table desa_src, desa_attr;

\echo '== kecamatan (dissolve desa)'
-- Semua desa berkode ikut, termasuk yang kodenya belum ada di
-- desa_kelurahan, supaya wilayah kecamatan tidak bolong.
drop table if exists import_batas.kecamatan_geom;
create table kecamatan_geom as
select left(kode, 8) as kode,
       drop_small_holes(st_union(geom), :min_hole)::geometry(MultiPolygon, 4326) as geom
  from desa_geom
 group by 1;
alter table kecamatan_geom add primary key (kode);

\echo '== kabupaten_kota'
drop table if exists import_batas.kabupaten_geom;
create table kabupaten_geom as
select a.kdpkab as kode,
       st_multi(st_collectionextract(st_makevalid(
         st_union(st_collectionextract(st_makevalid(s.geom), 3))), 3))::geometry(MultiPolygon, 4326) as geom
  from kab_src s
  join kab_attr a using (fid)
 -- 21 fitur tanpa KDPKAB adalah area yang hanya dialokasikan ke provinsi;
 -- tidak ikut karena provinsi didissolve dari kab/kota.
 where a.kdpkab ~ '^\d{2}\.\d{2}$'
 group by 1;
alter table kabupaten_geom add primary key (kode);
drop table kab_src, kab_attr;

\echo '== provinsi (dissolve kab/kota)'
drop table if exists import_batas.provinsi_geom;
create table provinsi_geom as
select left(kode, 2) as kode,
       drop_small_holes(st_union(geom), :min_hole)::geometry(MultiPolygon, 4326) as geom
  from kabupaten_geom
 group by 1;
alter table provinsi_geom add primary key (kode);

-- Peta nasional: simplify kasar dan buang pulau kecil (< ~25 km²).
alter table provinsi_geom add column geom_overview geometry(MultiPolygon, 4326);
update provinsi_geom p
   set geom_overview = (
     select st_multi(st_collect(d.geom))
       from st_dump(st_simplifypreservetopology(p.geom, 0.01)) d
      where st_area(d.geom) >= 0.002
   );

\echo '== buang kode yang tidak ada di tabel atribut (FK)'
create table if not exists laporan_orphan (level text, kode text);
truncate laporan_orphan;
insert into laporan_orphan
  select 'desa', kode from desa_geom where kode not in (select kode from public.desa_kelurahan)
  union all
  select 'kecamatan', kode from kecamatan_geom where kode not in (select kode from public.kecamatan)
  union all
  select 'kabupaten_kota', kode from kabupaten_geom where kode not in (select kode from public.kabupaten_kota)
  union all
  select 'provinsi', kode from provinsi_geom where kode not in (select kode from public.provinsi);
delete from desa_geom where kode in (select kode from laporan_orphan where level = 'desa');
delete from kecamatan_geom where kode in (select kode from laporan_orphan where level = 'kecamatan');
delete from kabupaten_geom where kode in (select kode from laporan_orphan where level = 'kabupaten_kota');
delete from provinsi_geom where kode in (select kode from laporan_orphan where level = 'provinsi');

\echo '== cakupan desa terpetakan'
-- desa_total: jumlah desa resmi di bawah wilayah itu (desa_kelurahan);
-- desa_terpetakan: berapa di antaranya yang punya geometri.
create temp table cakupan as
select d.kode, (g.kode is not null) as terpetakan
  from public.desa_kelurahan d left join desa_geom g using (kode);

alter table kecamatan_geom add column desa_terpetakan int, add column desa_total int;
alter table kabupaten_geom add column desa_terpetakan int, add column desa_total int;
alter table provinsi_geom add column desa_terpetakan int, add column desa_total int;

update kecamatan_geom t set desa_terpetakan = c.n_peta, desa_total = c.n
  from (select left(kode, 8) k, count(*) filter (where terpetakan) n_peta, count(*) n from cakupan group by 1) c
 where c.k = t.kode;
update kabupaten_geom t set desa_terpetakan = c.n_peta, desa_total = c.n
  from (select left(kode, 5) k, count(*) filter (where terpetakan) n_peta, count(*) n from cakupan group by 1) c
 where c.k = t.kode;
update provinsi_geom t set desa_terpetakan = c.n_peta, desa_total = c.n
  from (select left(kode, 2) k, count(*) filter (where terpetakan) n_peta, count(*) n from cakupan group by 1) c
 where c.k = t.kode;

-- drop_small_holes bisa menghasilkan shell bersarang (pulau di dalam danau).
update kecamatan_geom set geom = st_multi(st_collectionextract(st_makevalid(geom), 3)) where not st_isvalid(geom);
update provinsi_geom set geom = st_multi(st_collectionextract(st_makevalid(geom), 3)) where not st_isvalid(geom);

-- Samakan susunan kolom dengan tabel public yang akan digantikan.
alter table desa_geom add column updated_at timestamptz not null default now();
alter table kecamatan_geom add column updated_at timestamptz not null default now();
alter table kabupaten_geom add column updated_at timestamptz not null default now();
alter table provinsi_geom add column updated_at timestamptz not null default now();

-- Buang baris mati dari UPDATE di atas.
vacuum full desa_geom, kecamatan_geom, kabupaten_geom, provinsi_geom;

\echo '== ringkasan'
select 'desa' level, count(*) n, sum(st_npoints(geom)) vertex, pg_size_pretty(pg_total_relation_size('desa_geom')) size from desa_geom
union all select 'kecamatan', count(*), sum(st_npoints(geom)), pg_size_pretty(pg_total_relation_size('kecamatan_geom')) from kecamatan_geom
union all select 'kabupaten_kota', count(*), sum(st_npoints(geom)), pg_size_pretty(pg_total_relation_size('kabupaten_geom')) from kabupaten_geom
union all select 'provinsi', count(*), sum(st_npoints(geom)), pg_size_pretty(pg_total_relation_size('provinsi_geom')) from provinsi_geom
union all select 'provinsi_overview', count(*), sum(st_npoints(geom_overview)), null from provinsi_geom;
select level, count(*) orphan from laporan_orphan group by 1;
select count(*) filter (where not st_isvalid(geom)) invalid_desa from desa_geom;
