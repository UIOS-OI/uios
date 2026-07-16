"use client";

import { useThree } from "@react-three/fiber";
import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";

export type InteractionState = {
  hoveredId: string | null;
  selectedId: string | null;
  arrivedId: string | null;
  pointer: MutableRefObject<THREE.Vector2>;
  pointerIntensity: MutableRefObject<number>;
  pointerPresence: MutableRefObject<number>;
  canGoBack: boolean;
  portalPhase: "idle" | "approach" | "fracture" | "tunnel" | "materialize";
  navigationMode: "reveal" | "cinematic";
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
  arrive: (id: string | null) => void;
  goBack: () => void;
  setPortalPhase: (phase: InteractionState["portalPhase"]) => void;
};

const InteractionContext = createContext<InteractionState | null>(null);

export function InteractionSystem({ children }: { children: ReactNode }) {
  const gl = useThree((state) => state.gl);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  const [portalPhase, setPortalPhase] = useState<InteractionState["portalPhase"]>("idle");
  const [navigationMode, setNavigationMode] = useState<InteractionState["navigationMode"]>("reveal");
  const pointer = useRef(new THREE.Vector2());
  const pointerIntensity = useRef(0);
  const pointerPresence = useRef(0);
  const pointerInside = useRef(false);
  const history = useRef<Array<string | null>>([]);
  const hover = useCallback((id: string | null) => setHoveredId(id), []);
  const select = useCallback((id: string | null) => {
    setSelectedId((current) => {
      if (current === id) return current;
      history.current.push(current);
      return id;
    });
    setNavigationMode("reveal");
    setPortalPhase("idle");
  }, []);
  const arrive = useCallback((id: string | null) => setArrivedId(id), []);
  const goBack = useCallback(() => {
    const previous = history.current.pop() ?? null;
    setSelectedId(previous);
    setNavigationMode("reveal");
    setPortalPhase("idle");
  }, []);

  useEffect(() => {
    const cinematicTravel = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setSelectedId((current) => { history.current.push(current); return id; });
      setNavigationMode("cinematic");
      setPortalPhase("approach");
    };
    window.addEventListener("uios:cinematic-travel", cinematicTravel);
    return () => window.removeEventListener("uios:cinematic-travel", cinematicTravel);
  }, []);

  useEffect(() => {
    const pulse = () => { pointerIntensity.current = 1; };
    const enter = () => { pointerInside.current = true; };
    const leave = () => { pointerInside.current = false; };
    gl.domElement.addEventListener("pointerdown", pulse, { passive: true });
    gl.domElement.addEventListener("pointerenter", enter, { passive: true });
    gl.domElement.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      gl.domElement.removeEventListener("pointerdown", pulse);
      gl.domElement.removeEventListener("pointerenter", enter);
      gl.domElement.removeEventListener("pointerleave", leave);
    };
  }, [gl]);

  useRenderTask("interaction-field", (state, delta) => {
    pointer.current.lerp(state.pointer, Math.min(1, delta * 9));
    pointerIntensity.current = Math.max(
      state.pointer.length() * 0.32,
      pointerIntensity.current - delta * 0.7,
    );
    pointerPresence.current = THREE.MathUtils.damp(
      pointerPresence.current,
      pointerInside.current ? 1 : 0,
      2.2,
      delta,
    );
  }, -20);
  const state = useMemo(
    () => ({ arrivedId, hoveredId, selectedId, pointer, pointerIntensity, pointerPresence, canGoBack: history.current.length > 0, navigationMode, portalPhase, hover, select, arrive, goBack, setPortalPhase }),
    [arrive, arrivedId, goBack, hover, hoveredId, navigationMode, portalPhase, select, selectedId],
  );

  return <InteractionContext.Provider value={state}>{children}</InteractionContext.Provider>;
}

export function useInteractionSystem() {
  const interaction = useContext(InteractionContext);
  if (!interaction) throw new Error("useInteractionSystem must be used inside InteractionSystem.");
  return interaction;
}
