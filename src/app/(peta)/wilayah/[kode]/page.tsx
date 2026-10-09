import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CopyCode } from "@/components/CopyCode";
import { ChildList } from "@/components/ChildList";
import {
  levelOfKode,
  provinsiCodeOf,
  kabupatenCodeOf,
  kecamatanCodeOf,
  LEVEL_LABELS,
  type Level,
} from "@/lib/wilayah";

// Cache the rendered page itself (not just the underlying data) so a
// popular wilayah page is served from Vercel's cache without re-running
// React render or hitting Supabase at all on subsequent visits.
export const revalidate = 86400;

type Crumb = { kode: string; nama: string };

type RiwayatRow = {
  id: number;
  nama_wilayah: string;
  level_asal: string;
  keterangan: string | null;
};

// Wrapped in React's cache() so generateMetadata and the page body share one
// query per kode instead of fetching the same row twice per request.
const getProvinsiRow = cache((kode: string) =>
  supabase
    .from("provinsi")
    .select("kode,nama,ibukota,luas_km2,jumlah_penduduk")
    .eq("kode", kode)
    .maybeSingle()
);

const getKabupatenRow = cache((kode: string) =>
  supabase
    .from("kabupaten_kota")
    .select(
      "kode,nama,jenis,ibukota,provinsi_kode,luas_km2,jumlah_penduduk,jumlah_kecamatan,jumlah_kelurahan,jumlah_desa"
    )
    .eq("kode", kode)
    .maybeSingle()
);

const getKecamatanRow = cache((kode: string) =>
  supabase
    .from("kecamatan")
    .select("kode,nama,kabupaten_kode,jumlah_kelurahan,jumlah_desa")
    .eq("kode", kode)
    .maybeSingle()
);

const getDesaRow = cache((kode: string) =>
  supabase
    .from("desa_kelurahan")
    .select("kode,nama,jenis,kecamatan_kode")
    .eq("kode", kode)
    .maybeSingle()
);

const getBreadcrumbAncestors = cache(async (kode: string, level: Level): Promise<Crumb[]> => {
  const crumbs: Crumb[] = [];

  if (level === "kabupaten_kota" || level === "kecamatan" || level === "desa_kelurahan") {
    const { data } = await supabase
      .from("provinsi")
      .select("kode,nama")
      .eq("kode", provinsiCodeOf(kode))
      .maybeSingle();
    if (data) crumbs.push(data);
  }
  if (level === "kecamatan" || level === "desa_kelurahan") {
    const { data } = await supabase
      .from("kabupaten_kota")
      .select("kode,nama")
      .eq("kode", kabupatenCodeOf(kode))
      .maybeSingle();
    if (data) crumbs.push(data);
  }
  if (level === "desa_kelurahan") {
    const { data } = await supabase
      .from("kecamatan")
      .select("kode,nama")
      .eq("kode", kecamatanCodeOf(kode))
      .maybeSingle();
    if (data) crumbs.push(data);
  }

  return crumbs;
});

export async function generateMetadata({
  params,
}: PageProps<"/wilayah/[kode]">): Promise<Metadata> {
  const { kode } = await params;
  const level = levelOfKode(kode);
  if (!level) return {};

  let nama: string | undefined;
  let jenis: string | undefined;

  if (level === "provinsi") {
    const { data } = await getProvinsiRow(kode);
    if (!data) return {};
    nama = data.nama;
  } else if (level === "kabupaten_kota") {
    const { data } = await getKabupatenRow(kode);
    if (!data) return {};
    nama = data.nama;
    jenis = data.jenis;
  } else if (level === "kecamatan") {
    const { data } = await getKecamatanRow(kode);
    if (!data) return {};
    nama = data.nama;
  } else {
    const { data } = await getDesaRow(kode);
    if (!data) return {};
    nama = data.nama;
    jenis = data.jenis;
  }

  const crumbs = await getBreadcrumbAncestors(kode, level);
  const ancestorNames = [...crumbs].reverse().map((c) => c.nama);
  const label = jenis ?? LEVEL_LABELS[level];
  const locationSuffix = ancestorNames.length > 0 ? `, ${ancestorNames.join(", ")}` : "";

  return {
    title: `${nama} - Kode Wilayah ${kode}`,
    description: `Kode wilayah resmi untuk ${label} ${nama}${locationSuffix}. Kode: ${kode}. Berdasarkan Kepmendagri No. 300.2.2-2138 Tahun 2025.`,
    alternates: { canonical: `/wilayah/${kode}` },
  };
}

function StatGrid({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-gray-100 px-4 py-3">
          <dt className="text-xs text-gray-400">{s.label}</dt>
          <dd className="mt-1 text-lg font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}


function RiwayatList({ items }: { items: RiwayatRow[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-100">
      {items.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <p className="font-medium">{r.nama_wilayah}</p>
          <p className="text-xs text-gray-500">
            {r.keterangan ?? "Wilayah ini telah dihapus atau digabung ke wilayah lain."}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function WilayahDetailPage({
  params,
}: PageProps<"/wilayah/[kode]">) {
  const { kode } = await params;
  const level = levelOfKode(kode);
  if (!level) notFound();

  if (level === "provinsi") {
    const { data: provinsi } = await getProvinsiRow(kode);
    if (!provinsi) notFound();

    const { data: kabupaten } = await supabase
      .from("kabupaten_kota")
      .select("kode,nama,jenis")
      .eq("provinsi_kode", kode)
      .order("nama");

    return (
      <DetailLayout crumbs={[]} level={level} kode={provinsi.kode} nama={provinsi.nama}>
        <StatGrid
          stats={[
            { label: "Ibukota", value: provinsi.ibukota },
            { label: "Luas", value: `${provinsi.luas_km2.toLocaleString("id-ID")} km²` },
            { label: "Penduduk", value: provinsi.jumlah_penduduk.toLocaleString("id-ID") },
          ]}
        />
        <Section title={`Kabupaten/Kota (${kabupaten?.length ?? 0})`}>
          <ChildList items={kabupaten ?? []} />
        </Section>
      </DetailLayout>
    );
  }

  if (level === "kabupaten_kota") {
    const { data: kab } = await getKabupatenRow(kode);
    if (!kab) notFound();

    const [{ data: kecamatan }, { data: riwayat }, crumbs] = await Promise.all([
      supabase.from("kecamatan").select("kode,nama").eq("kabupaten_kode", kode).order("nama"),
      // Riwayat directly under this kabupaten: kecamatan that were themselves
      // renamed/removed (their own now-defunct kode sits in kecamatan_kode),
      // plus desa/kelurahan whose kecamatan is unknown/also gone.
      supabase
        .from("riwayat_perubahan")
        .select("id,nama_wilayah,level_asal,keterangan")
        .eq("kabupaten_kode", kode)
        .or("level_asal.eq.KECAMATAN_RIWAYAT,kecamatan_kode.is.null"),
      getBreadcrumbAncestors(kode, level),
    ]);

    return (
      <DetailLayout crumbs={crumbs} level={level} kode={kab.kode} nama={kab.nama} jenis={kab.jenis}>
        <StatGrid
          stats={[
            { label: "Ibukota", value: kab.ibukota },
            { label: "Luas", value: `${kab.luas_km2.toLocaleString("id-ID")} km²` },
            { label: "Penduduk", value: kab.jumlah_penduduk.toLocaleString("id-ID") },
            { label: "Kecamatan", value: kab.jumlah_kecamatan },
            { label: "Kelurahan", value: kab.jumlah_kelurahan },
            { label: "Desa", value: kab.jumlah_desa },
          ]}
        />
        <Section title={`Kecamatan (${kecamatan?.length ?? 0})`}>
          <ChildList items={kecamatan ?? []} />
        </Section>
        {riwayat && riwayat.length > 0 && (
          <Section title="Riwayat Perubahan Wilayah">
            <RiwayatList items={riwayat} />
          </Section>
        )}
      </DetailLayout>
    );
  }

  if (level === "kecamatan") {
    const { data: kec } = await getKecamatanRow(kode);
    if (!kec) notFound();

    const [{ data: desa }, { data: riwayat }, crumbs] = await Promise.all([
      supabase
        .from("desa_kelurahan")
        .select("kode,nama,jenis")
        .eq("kecamatan_kode", kode)
        .order("nama"),
      supabase
        .from("riwayat_perubahan")
        .select("id,nama_wilayah,level_asal,keterangan")
        .eq("kecamatan_kode", kode),
      getBreadcrumbAncestors(kode, level),
    ]);

    return (
      <DetailLayout crumbs={crumbs} level={level} kode={kec.kode} nama={kec.nama}>
        <StatGrid
          stats={[
            { label: "Kelurahan", value: kec.jumlah_kelurahan },
            { label: "Desa", value: kec.jumlah_desa },
          ]}
        />
        <Section title={`Desa/Kelurahan (${desa?.length ?? 0})`}>
          <ChildList items={desa ?? []} />
        </Section>
        {riwayat && riwayat.length > 0 && (
          <Section title="Riwayat Perubahan Wilayah">
            <RiwayatList items={riwayat} />
          </Section>
        )}
      </DetailLayout>
    );
  }

  // desa_kelurahan
  const { data: desa } = await getDesaRow(kode);
  if (!desa) notFound();

  const [{ data: siblings }, crumbs] = await Promise.all([
    supabase
      .from("desa_kelurahan")
      .select("kode,nama,jenis")
      .eq("kecamatan_kode", desa.kecamatan_kode)
      .neq("kode", kode)
      .order("nama"),
    getBreadcrumbAncestors(kode, level),
  ]);
  const kecamatanNama = crumbs[crumbs.length - 1]?.nama ?? "kecamatan ini";

  return (
    <DetailLayout crumbs={crumbs} level={level} kode={desa.kode} nama={desa.nama} jenis={desa.jenis}>
      {siblings && siblings.length > 0 && (
        <Section title={`Desa/Kelurahan Lain di Kec. ${kecamatanNama} (${siblings.length})`}>
          <ChildList items={siblings} />
        </Section>
      )}
    </DetailLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function DetailLayout({
  crumbs,
  level,
  kode,
  nama,
  jenis,
  children,
}: {
  crumbs: Crumb[];
  level: Level;
  kode: string;
  nama: string;
  jenis?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
        <Link href="/" className="hover:text-gray-600">
          Beranda
        </Link>
        {crumbs.map((c) => (
          <span key={c.kode} className="flex items-center gap-1">
            <span>/</span>
            <Link href={`/wilayah/${c.kode}`} className="hover:text-gray-600">
              {c.nama}
            </Link>
          </span>
        ))}
        <span>/</span>
        <span className="text-gray-600">{nama}</span>
      </nav>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{nama}</h1>
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            {jenis ?? LEVEL_LABELS[level]}
          </span>
        </div>
        <CopyCode value={kode} />
      </div>

      {children}
    </div>
  );
}
