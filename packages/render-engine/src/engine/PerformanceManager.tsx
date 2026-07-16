"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type PerformanceTier = "economy" | "balanced" | "high";

export type PerformanceBudget = {
  factor: number;
  tier: PerformanceTier;
  particleScale: number;
  networkScale: number;
  shaderQuality: number;
  transmissionResolution: number;
  sceneComplexity: 0 | 1 | 2;
  setSceneComplexity: (complexity: 0 | 1 | 2) => void;
};

const ignoreComplexity = () => undefined;

const HIGH_BUDGET: PerformanceBudget = {
  factor: 1,
  tier: "high",
  particleScale: 1,
  networkScale: 1,
  shaderQuality: 1,
  transmissionResolution: 256,
  sceneComplexity: 0,
  setSceneComplexity: ignoreComplexity,
};

const PerformanceContext = createContext<PerformanceBudget>(HIGH_BUDGET);

function createBudget(
  factor: number,
  sceneComplexity: 0 | 1 | 2,
  setSceneComplexity: (complexity: 0 | 1 | 2) => void,
): PerformanceBudget {
  const particleComplexityScale = sceneComplexity === 2 ? 0.58 : sceneComplexity === 1 ? 0.8 : 1;
  const networkComplexityScale = sceneComplexity === 2 ? 0.7 : sceneComplexity === 1 ? 0.86 : 1;
  if (factor < 0.42) {
    return {
      factor,
      tier: "economy",
      particleScale: 0.42 * particleComplexityScale,
      networkScale: 0.58 * networkComplexityScale,
      shaderQuality: 0,
      transmissionResolution: 64,
      sceneComplexity,
      setSceneComplexity,
    };
  }

  if (factor < 0.76) {
    return {
      factor,
      tier: "balanced",
      particleScale: 0.62 * particleComplexityScale,
      networkScale: 0.72 * networkComplexityScale,
      shaderQuality: 0.5,
      transmissionResolution: 128,
      sceneComplexity,
      setSceneComplexity,
    };
  }

  return {
    ...HIGH_BUDGET,
    factor,
    particleScale: HIGH_BUDGET.particleScale * particleComplexityScale,
    networkScale: HIGH_BUDGET.networkScale * networkComplexityScale,
    sceneComplexity,
    setSceneComplexity,
  };
}

export function PerformanceManager({
  children,
  factor,
}: {
  children: ReactNode;
  factor: number;
}) {
  const [sceneComplexity, setSceneComplexityState] = useState<0 | 1 | 2>(0);
  const setSceneComplexity = useCallback((complexity: 0 | 1 | 2) => {
    setSceneComplexityState((current) => current === complexity ? current : complexity);
  }, []);
  const budget = useMemo(
    () => createBudget(factor, sceneComplexity, setSceneComplexity),
    [factor, sceneComplexity, setSceneComplexity],
  );
  return <PerformanceContext.Provider value={budget}>{children}</PerformanceContext.Provider>;
}

export function usePerformanceBudget() {
  return useContext(PerformanceContext);
}
