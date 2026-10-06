import Image from "next/image";
import Link from "next/link";
import panelPhoto from "@/assets/panel-photo.jpg";
import { MapProvider } from "@/components/map/MapContext";
import { MapCanvas } from "@/components/map/MapCanvasLazy";
import { SearchBox } from "@/components/SearchBox";

// Full-screen, map-first shell shared by the home and wilayah pages. Living
// in a layout keeps the Leaflet map mounted across navigations, so moving
// between wilayah only swaps the panel content and re-fits the map.
export default function PetaLayout({ children }: { children: React.ReactNode }) {
  return (
    <MapProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-white text-gray-900 md:flex-row">
        <aside className="order-2 flex max-h-[55dvh] min-h-0 w-full shrink-0 flex-col border-t border-gray-200 bg-white md:order-1 md:h-full md:max-h-none md:w-[420px] md:border-t-0 md:border-r">
          <header className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Kode Wilayah Indonesia
            </Link>
            <SearchBox />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {/* Pinned to the bottom of the panel on desktop. Hidden on phones,
              where the panel is only half the screen and needs the room. */}
          <footer className="hidden shrink-0 border-t border-gray-100 md:block">
            <Image
              src={panelPhoto}
              alt="Pendampingan pengolahan data wilayah"
              sizes="420px"
              placeholder="blur"
              className="h-auto w-full"
            />
          </footer>
        </aside>
        <div className="relative order-1 min-h-0 flex-1 md:order-2">
          <MapCanvas />
        </div>
      </div>
    </MapProvider>
  );
}
