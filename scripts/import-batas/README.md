# Import batas wilayah ke Supabase

Sumber: `db/clear/` (BIG edisi Juni 2026, sudah disimplify di QGIS).

| Level | Asal geometri |
|---|---|
| Desa/kelurahan | `db/clear/batasdesa_clear.gpkg`, digabung per kode |
| Kecamatan | dissolve desa (`left(kode, 8)`) |
| Kabupaten/kota | `db/clear/bataskabkot_clear.gpkg`, digabung per kode |
| Provinsi | dissolve kabupaten/kota (`left(kode, 2)`) |

File di `db/clear` hanya berisi geometri karena atributnya NULL. Atribut diambil
dari file sebelum simplify (`db/batasdesa_zdrop.gpkg`, `db/bataskabkot_clear.gpkg`)
lalu digabung per `fid`. Urutan fid kedua file identik.

## Langkah

```bash
DBURL=$(grep '^SUPABASE_DB_URL=' .env.local | cut -d= -f2-)

bash scripts/import-batas/1_dump.sh                     # GPKG -> db/dump/*.sql
psql "$DBURL" -c "create schema if not exists import_batas"
for f in desa_src desa_attr kab_src kab_attr; do psql "$DBURL" -q -f db/dump/$f.sql; done
psql "$DBURL" -f scripts/import-batas/2_build.sql       # bangun tabel di import_batas
psql "$DBURL" -f scripts/import-batas/3_swap.sql        # tukar ke public (1 transaksi)
# kalau ada masalah:
psql "$DBURL" -f scripts/import-batas/4_rollback.sql
```

Setelah hasilnya dicek, hapus `backup_batas` dan `import_batas` untuk
mengembalikan ruang DB. Semua `drop` di `2_build.sql` wajib memakai prefix
schema `import_batas.`. Tanpa prefix, search_path bisa jatuh ke `public` dan
menghapus tabel produksi. Ini sudah terjadi pada import 9 Okt 2026, sehingga
data lama (batasdesa22m) tidak punya backup. Cache Next.js menyimpan RPC selama 24 jam, jadi
redeploy agar peta langsung memakai data baru.

Yang sengaja dibuang:
- Fitur desa tanpa `KDEPUM` (pulau/area yang belum dialokasikan ke desa).
- Fitur kab/kota tanpa `KDPKAB` (area yang hanya dialokasikan ke provinsi).
- Kode yang tidak ada di tabel atribut (`desa_kelurahan`, dst). Daftarnya
  tersimpan di `import_batas.laporan_orphan`.
