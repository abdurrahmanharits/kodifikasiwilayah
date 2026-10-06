import { supabase } from "@/lib/supabase";
import { ChildList } from "@/components/ChildList";

// Same caching as the wilayah pages: the provinsi list changes rarely.
export const revalidate = 86400;

export default async function Home() {
  const { data: provinsi } = await supabase.from("provinsi").select("kode,nama").order("nama");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-gray-600">
          Cari provinsi, kabupaten/kota, kecamatan, atau desa/kelurahan, atau klik wilayah langsung di
          peta.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Data Tampil Berdasarkan Kepmendagri No. 300.2.2-2138 Tahun 2025
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-gray-500">Provinsi ({provinsi?.length ?? 0})</h2>
        <ChildList items={provinsi ?? []} />
      </div>
    </div>
  );
}
