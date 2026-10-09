-- Tukar tabel geometri public dengan hasil 2_build.sql dalam satu transaksi.
-- Tabel lama dipindah ke schema backup_batas (tidak diekspos PostgREST),
-- jadi bisa dikembalikan dengan 4_rollback.sql sampai backup dihapus.
\set ON_ERROR_STOP on
set statement_timeout = 0;
begin;

create schema backup_batas;
revoke all on schema backup_batas from anon, authenticated;

alter table if exists public.desa_geom      set schema backup_batas;
alter table if exists public.kecamatan_geom set schema backup_batas;
alter table if exists public.kabupaten_geom set schema backup_batas;
alter table if exists public.provinsi_geom  set schema backup_batas;

alter table import_batas.desa_geom      set schema public;
alter table import_batas.kecamatan_geom set schema public;
alter table import_batas.kabupaten_geom set schema public;
alter table import_batas.provinsi_geom  set schema public;

alter table public.desa_geom
  add foreign key (kode) references public.desa_kelurahan (kode) on delete cascade;
alter table public.kecamatan_geom
  add foreign key (kode) references public.kecamatan (kode) on delete cascade;
alter table public.kabupaten_geom
  add foreign key (kode) references public.kabupaten_kota (kode) on delete cascade;
alter table public.provinsi_geom
  add foreign key (kode) references public.provinsi (kode) on delete cascade;

-- desa_geom sudah punya indeks GiST dari 2_build.sql.
create index on public.kecamatan_geom using gist (geom);
create index on public.kabupaten_geom using gist (geom);
create index on public.provinsi_geom  using gist (geom);
-- wilayah_geojson memfilter anak dengan "kode like '32.02.%'".
create index on public.desa_geom      (kode text_pattern_ops);
create index on public.kecamatan_geom (kode text_pattern_ops);
create index on public.kabupaten_geom (kode text_pattern_ops);

do $$
declare t text;
begin
  foreach t in array array['desa_geom', 'kecamatan_geom', 'kabupaten_geom', 'provinsi_geom'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
analyze public.desa_geom, public.kecamatan_geom, public.kabupaten_geom, public.provinsi_geom;
