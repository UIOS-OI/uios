"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type InteractionState = {
  hoveredId: string | null;
  selectedId: string | null;
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
};

const InteractionContext = createContext<InteractionState | null>(null);

export function InteractionSystem({ children }: { children: ReactNode }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hover = useCallback((id: string | null) => setHoveredId(id), []);
  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const state = useMemo(
    () => ({ hoveredId, selectedId, hover, select }),
    [hover, hoveredId, select, selectedId],
  );

  return <InteractionContext.Provider value={state}>{children}</InteractionContext.Provider>;
}

export function useInteractionSystem() {
  const interaction = useContext(InteractionContext);
  if (!interaction) throw new Error("useInteractionSystem must be used inside InteractionSystem.");
  return interaction;
}
