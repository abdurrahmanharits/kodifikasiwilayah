-- Kembalikan tabel geometri lama dari backup_batas (kebalikan 3_swap.sql).
\set ON_ERROR_STOP on
begin;
create schema if not exists import_batas;
alter table public.desa_geom      set schema import_batas;
alter table public.kecamatan_geom set schema import_batas;
alter table public.kabupaten_geom set schema import_batas;
alter table public.provinsi_geom  set schema import_batas;
alter table backup_batas.desa_geom      set schema public;
alter table backup_batas.kecamatan_geom set schema public;
alter table backup_batas.kabupaten_geom set schema public;
alter table backup_batas.provinsi_geom  set schema public;
drop schema backup_batas;
commit;
notify pgrst, 'reload schema';
