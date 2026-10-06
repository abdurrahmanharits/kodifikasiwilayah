"use client";

import { createContext, useContext, useState } from "react";

// State shared between the side panel and the persistent map: which search
// results to outline, and which wilayah is hovered in a list.
type MapState = {
  searchKodes: string[];
  setSearchKodes: (kodes: string[]) => void;
  activeKode: string | null;
  setActiveKode: (kode: string | null) => void;
};

const MapContext = createContext<MapState | null>(null);

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [searchKodes, setSearchKodes] = useState<string[]>([]);
  const [activeKode, setActiveKode] = useState<string | null>(null);
  return (
    <MapContext.Provider value={{ searchKodes, setSearchKodes, activeKode, setActiveKode }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapState(): MapState {
  const state = useContext(MapContext);
  if (!state) throw new Error("useMapState must be used inside <MapProvider>");
  return state;
}
