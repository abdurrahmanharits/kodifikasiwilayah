"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import L from "leaflet";
import {
  GeoJSON,
  LayersControl,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { levelOfKode, type Level } from "@/lib/wilayah";
import type { WilayahCollection, WilayahFeature } from "@/lib/wilayah-geo";
import { DownloadControl } from "./DownloadControl";
import { useMapState } from "./MapContext";

type ChildIsi = "kabupaten" | "kecamatan" | "desa";

// The RPC always returns a 2D bbox on "batas" features; narrow GeoJSON's
// optional 2D/3D BBox union.
type BoundaryFeature = Omit<WilayahFeature, "bbox"> & { bbox: [number, number, number, number] };
type Geo = BoundaryFeature | WilayahCollection;
type LabelledProps = WilayahFeature["properties"] & { label?: [number, number] };

// One level down from each level; desa is the bottom.
const CHILD_ISI: Record<Level, ChildIsi | undefined> = {
  provinsi: "kabupaten",
  kabupaten_kota: "kecamatan",
  kecamatan: "desa",
  desa_kelurahan: undefined,
};

const INDONESIA_URL = "/api/v1/wilayah/indonesia/geojson";
const INDONESIA_BOUNDS = L.latLngBounds([-11.1, 94.9], [6.2, 141.1]);

// Module-level cache keyed by URL so navigating back and forth never
// refetches outlines already loaded in this tab. null = not available.
const geoCache = new Map<string, Promise<Geo | null>>();

function loadGeo(url: string): Promise<Geo | null> {
  let pending = geoCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<Geo>) : null))
      .catch(() => null);
    geoCache.set(url, pending);
  }
  return pending;
}

const BASEMAP_SATELIT = "Satelit";
const BASEMAP_PETA = "Peta";

type StyleSet = {
  primary: L.PathOptions;
  active: L.PathOptions;
  // Primary drawn as a thick outline only, when children fill the inside.
  outline: L.PathOptions;
  child: L.PathOptions;
  childHover: L.PathOptions;
};

// Blue outlines vanish on imagery, so the satellite basemap gets
// high-contrast yellow/white instead.
const STYLES: Record<string, StyleSet> = {
  [BASEMAP_SATELIT]: {
    primary: { color: "#facc15", weight: 2, fillOpacity: 0.08 },
    active: { color: "#ef4444", weight: 3, fillOpacity: 0.25 },
    outline: { color: "#facc15", weight: 3.5, fillOpacity: 0, interactive: false },
    child: { color: "#ffffff", weight: 1, opacity: 0.85, fillOpacity: 0.05 },
    childHover: { color: "#ef4444", weight: 2.5, opacity: 1, fillOpacity: 0.25 },
  },
  [BASEMAP_PETA]: {
    primary: { color: "#2563eb", weight: 2, fillOpacity: 0.15 },
    active: { color: "#dc2626", weight: 3, fillOpacity: 0.3 },
    outline: { color: "#1e3a8a", weight: 3.5, fillOpacity: 0, interactive: false },
    child: { color: "#2563eb", weight: 1, opacity: 0.9, fillOpacity: 0.05 },
    childHover: { color: "#dc2626", weight: 2.5, opacity: 1, fillOpacity: 0.3 },
  },
};

function routeKodeOf(pathname: string): string | null {
  const match = pathname.match(/^\/wilayah\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function BasemapWatcher({ onChange }: { onChange: (name: string) => void }) {
  useMapEvents({ baselayerchange: (e) => onChange(e.name) });
  return null;
}

// Refit whenever the view changes (new page, new search), then report the
// fitted zoom so labels can hide once the user zooms well out of it.
function FitView({
  viewKey,
  features,
  onFitted,
}: {
  viewKey: string;
  features: BoundaryFeature[] | null;
  onFitted: (zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!features) return;
    let bounds = INDONESIA_BOUNDS;
    if (features.length > 0) {
      bounds = L.latLngBounds([]);
      for (const f of features) {
        const [minX, minY, maxX, maxY] = f.bbox;
        bounds.extend([
          [minY, minX],
          [maxY, maxX],
        ]);
      }
    }
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    onFitted(map.getZoom());
    // viewKey drives refits; features identity alone changes per load.
  }, [map, viewKey, features, onFitted]);
  return null;
}

// Permanent name labels at each feature's in-polygon anchor point.
function Labels({ features, minZoom }: { features: WilayahFeature[]; minZoom: number }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const labels = useMemo(
    () =>
      features.flatMap((f) => {
        const p = f.properties as LabelledProps;
        if (!p.label) return [];
        return [
          {
            kode: p.kode,
            position: [p.label[1], p.label[0]] as L.LatLngTuple,
            icon: L.divIcon({
              className: "wilayah-label",
              html: `<span>${escapeHtml(p.nama)}</span>`,
              iconSize: [0, 0],
            }),
          },
        ];
      }),
    [features]
  );

  if (zoom < minZoom) return null;
  return labels.map((l) => (
    <Marker key={l.kode} position={l.position} icon={l.icon} interactive={false} keyboard={false} />
  ));
}

function ChildrenLayer({
  data,
  styles,
  activeKode,
  onOpen,
}: {
  data: WilayahCollection;
  styles: StyleSet;
  activeKode: string | null;
  onOpen: (kode: string) => void;
}) {
  const ref = useRef<L.GeoJSON>(null);
  const activeRef = useRef(activeKode);

  // Hundreds of child polygons: restyle Leaflet layers directly when the
  // panel's hovered item changes, instead of re-rendering through React.
  useEffect(() => {
    activeRef.current = activeKode;
    ref.current?.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: WilayahFeature }).feature;
      const kode = feature?.properties.kode;
      (layer as L.Path).setStyle(kode === activeKode ? styles.childHover : styles.child);
    });
  }, [activeKode, styles]);

  return (
    <GeoJSON
      ref={ref}
      data={data}
      style={styles.child}
      onEachFeature={(feature, layer) => {
        const p = feature.properties as WilayahFeature["properties"];
        layer.bindTooltip(`${p.nama} (${p.kode})`, { sticky: true });
        layer.on({
          mouseover: () => (layer as L.Path).setStyle(styles.childHover),
          mouseout: () =>
            (layer as L.Path).setStyle(p.kode === activeRef.current ? styles.childHover : styles.child),
          click: () => onOpen(p.kode),
        });
      }}
    />
  );
}

type Loaded = {
  key: string;
  primary: BoundaryFeature[];
  children: WilayahCollection | null;
};

export default function MapCanvas() {
  const pathname = usePathname();
  const router = useRouter();
  const { searchKodes, activeKode } = useMapState();

  // What to draw: search results win; otherwise the current page's
  // wilayah plus one level below; otherwise all of Indonesia.
  const routeKode = routeKodeOf(pathname);
  const routeLevel = routeKode ? levelOfKode(routeKode) : null;
  let primaryKodes: string[] = [];
  let childUrl: string | null = null;
  if (searchKodes.length > 0) {
    primaryKodes = searchKodes;
  } else if (routeKode && routeLevel) {
    primaryKodes = [routeKode];
    const isi = CHILD_ISI[routeLevel];
    childUrl = isi ? `/api/v1/wilayah/${routeKode}/geojson?isi=${isi}` : null;
  } else {
    childUrl = INDONESIA_URL;
  }
  const viewKey = `${primaryKodes.join(",")}|${childUrl ?? ""}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [basemap, setBasemap] = useState(BASEMAP_SATELIT);
  const [fittedZoom, setFittedZoom] = useState(5);
  const styles = STYLES[basemap] ?? STYLES[BASEMAP_SATELIT];

  useEffect(() => {
    let cancelled = false;
    const [kodeList, url] = viewKey.split("|");
    const kodes = kodeList ? kodeList.split(",") : [];
    Promise.all([
      Promise.all(kodes.map((k) => loadGeo(`/api/v1/wilayah/${k}/geojson`))),
      url ? loadGeo(url) : Promise.resolve(null),
    ]).then(([primaryGeo, childGeo]) => {
      if (cancelled) return;
      setLoaded({
        key: viewKey,
        primary: primaryGeo.filter((g): g is BoundaryFeature => g?.type === "Feature"),
        children: childGeo?.type === "FeatureCollection" ? childGeo : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [viewKey]);

  const ready = loaded?.key === viewKey;
  const primary = ready ? loaded.primary : [];
  const children = ready ? loaded.children : null;
  const isSearch = searchKodes.length > 0;
  const missingPrimary = ready && primaryKodes.length > 0 && primary.length === 0;

  const main = !isSearch && primary.length === 1 ? primary[0].properties : null;
  const partial =
    main?.desa_total !== undefined && (main.desa_terpetakan ?? 0) < main.desa_total
      ? `Peta mencakup ${main.desa_terpetakan} dari ${main.desa_total} desa/kelurahan.`
      : null;

  return (
    <div className={`relative h-full w-full ${basemap === BASEMAP_PETA ? "basemap-peta" : "basemap-satelit"}`}>
      <MapContainer
        bounds={INDONESIA_BOUNDS}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name={BASEMAP_SATELIT}>
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={BASEMAP_PETA}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <ZoomControlBottomRight />
        {/* After the zoom control so Leaflet stacks it above; keyed by kode
            so the menu closes when navigating to another wilayah. */}
        {routeKode && routeLevel && !isSearch && (
          <DownloadControl
            key={routeKode}
            kode={routeKode}
            level={routeLevel}
            nama={main?.nama ?? routeKode}
            hasGeom={Boolean(main)}
          />
        )}
        <BasemapWatcher onChange={setBasemap} />

        {children && (
          <ChildrenLayer
            // Remount on view or basemap change so data and style refresh.
            key={`${viewKey}-${basemap}`}
            data={children}
            styles={styles}
            activeKode={activeKode}
            onOpen={(kode) => router.push(`/wilayah/${kode}`)}
          />
        )}

        {primary.map((f) => {
          const active = f.properties.kode === activeKode;
          const style = children ? styles.outline : active ? styles.active : styles.primary;
          return (
            <GeoJSON
              // Leaflet doesn't restyle on prop change; remount on highlight
              // or basemap switch instead.
              key={`${f.properties.kode}-${active}-${basemap}-${Boolean(children)}`}
              data={f}
              style={style}
              eventHandlers={
                isSearch ? { click: () => router.push(`/wilayah/${f.properties.kode}`) } : undefined
              }
            >
              {!children && (
                <Tooltip sticky>
                  {f.properties.nama} ({f.properties.kode})
                </Tooltip>
              )}
            </GeoJSON>
          );
        })}

        {children && <Labels key={viewKey} features={children.features} minZoom={fittedZoom - 1} />}
        <FitView viewKey={viewKey} features={ready ? primary : null} onFitted={setFittedZoom} />
      </MapContainer>

      {(!ready || missingPrimary || partial) && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow">
          {!ready
            ? "Memuat peta..."
            : missingPrimary
              ? "Peta batas wilayah ini belum tersedia."
              : partial}
        </div>
      )}
    </div>
  );
}

// The side panel sits on the left, so keep zoom buttons out of its way.
function ZoomControlBottomRight() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.zoom({ position: "bottomright" });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}
