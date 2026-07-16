"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useInteractionSystem } from "../systems/InteractionSystem";
import { useUniverseTopology, type SpatialLevel, type UniverseRegion } from "./UniverseManager";

type StreamingState = {
  visibleRegionIds: ReadonlySet<string>;
  visibleRegions: readonly UniverseRegion[];
  preloadedRegionIds: readonly string[];
  activeUniverseId: string | null;
  level: "universe" | SpatialLevel;
  sector: string;
};

const StreamingContext = createContext<StreamingState>({ visibleRegionIds: new Set(), visibleRegions: [], preloadedRegionIds: [], activeUniverseId: null, level: "universe", sector: "universe" });

export function StreamingManager({ children }: { children: ReactNode }) {
  const topology = useUniverseTopology();
  const interaction = useInteractionSystem();
  const value = useMemo<StreamingState>(() => {
    // arrivedId is the active universe. Selection starts portal travel but does not unload it.
    // Camera arrival atomically rebases coordinates, then the old universe is replaced by the new one's entries.
    const activeUniverseId = interaction.arrivedId;
    const visibleRegions = topology.childrenOf(activeUniverseId);
    const preloadedRegions = interaction.selectedId !== activeUniverseId ? topology.childrenOf(interaction.selectedId) : [];
    const activeNode = topology.nodeById(activeUniverseId);
    return {
      visibleRegionIds: new Set(visibleRegions.map((region) => region.id)),
      visibleRegions,
      preloadedRegionIds: preloadedRegions.map((region) => region.id),
      activeUniverseId,
      level: activeNode?.level ?? "universe",
      sector: activeUniverseId ?? "universe",
    };
  }, [interaction.arrivedId, interaction.selectedId, topology]);
  return <StreamingContext.Provider value={value}>{children}</StreamingContext.Provider>;
}

export function useStreamingSectors() { return useContext(StreamingContext); }
