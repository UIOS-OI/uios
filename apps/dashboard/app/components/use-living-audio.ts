"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REGION_FREQUENCIES: Record<string, [number, number, number]> = {
  aegis: [48, 72, 96],
  agents: [130, 195, 260],
  core: [55, 82.5, 110],
  forge: [92, 138, 184],
  marketplace: [104, 156, 208],
  memory: [174, 261, 348],
  observatory: [68, 102, 204],
  router: [110, 165, 220],
  workspace: [73, 109.5, 146],
};

type LivingAudioGraph = {
  context: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
};

export function useLivingAudio(regionId: string | null) {
  const graph = useRef<LivingAudioGraph | null>(null);
  const [enabled, setEnabled] = useState(false);

  const enable = useCallback(() => {
    if (graph.current) {
      void graph.current.context.resume();
      setEnabled(true);
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 1.8);
    master.connect(context.destination);
    const frequencies = REGION_FREQUENCIES.core;
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 2 ? 7 : 0;
      gain.gain.value = index === 0 ? 0.5 : index === 1 ? 0.18 : 0.08;
      oscillator.connect(gain).connect(master);
      oscillator.start();
      return oscillator;
    });
    graph.current = { context, master, oscillators };
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    const current = graph.current;
    if (!current) return;
    current.master.gain.cancelScheduledValues(current.context.currentTime);
    current.master.gain.exponentialRampToValueAtTime(0.0001, current.context.currentTime + 0.45);
    window.setTimeout(() => void current.context.suspend(), 500);
    setEnabled(false);
  }, []);

  useEffect(() => {
    const current = graph.current;
    if (!current || !enabled) return;
    const frequencies = REGION_FREQUENCIES[regionId ?? "core"] ?? REGION_FREQUENCIES.core;
    current.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.cancelScheduledValues(current.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequencies[index], current.context.currentTime + 2.4);
    });
  }, [enabled, regionId]);

  useEffect(() => {
    const reactToActivity = () => {
      const current = graph.current;
      if (!current || !enabled) return;
      const now = current.context.currentTime;
      current.master.gain.cancelScheduledValues(now);
      current.master.gain.linearRampToValueAtTime(0.075, now + 0.18);
      current.master.gain.exponentialRampToValueAtTime(0.045, now + 2.2);
    };
    window.addEventListener("uios:activity", reactToActivity);
    return () => window.removeEventListener("uios:activity", reactToActivity);
  }, [enabled]);

  useEffect(() => () => {
    const current = graph.current;
    if (!current) return;
    for (const oscillator of current.oscillators) oscillator.stop();
    void current.context.close();
    graph.current = null;
  }, []);

  return { disable, enable, enabled };
}
