"use client";

import { useEffect } from "react";
import { useUniverseTopology } from "../engine/UniverseManager";
import { useInteractionSystem } from "./InteractionSystem";

const STOP_WORDS = new Set(["a", "an", "and", "from", "in", "last", "me", "of", "show", "the", "to"]);

export function IntentNavigationSystem() {
  const topology = useUniverseTopology();
  const interaction = useInteractionSystem();
  useEffect(() => {
    const reveal = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query?.trim().toLowerCase();
      if (!query) return;
      const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token)).map((token) => token === "docs" ? "document" : token);
      let winner = topology.nodeById("memory");
      let winnerScore = 0;
      for (const region of topology.regions) {
        const ancestry = topology.pathTo(region.id).map((node) => node.label).join(" ");
        const haystack = `${region.label} ${region.id} ${region.description} ${region.documentPath ?? ""} ${ancestry}`.toLowerCase();
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? region.label.toLowerCase().includes(token) ? 6 : 3 : 0), 0);
        if (score > winnerScore) { winner = region; winnerScore = score; }
      }
      if (!winner) return;
      if (winner.action === "open-document" && winner.documentPath) {
        window.dispatchEvent(new CustomEvent("uios:open-document", { detail: { path: winner.documentPath, title: winner.label } }));
        window.dispatchEvent(new CustomEvent("uios:intent-result", { detail: { id: winner.id, label: winner.label } }));
        return;
      }
      interaction.select(winner.id);
      window.dispatchEvent(new CustomEvent("uios:intent-result", { detail: { id: winner.id, label: winner.label } }));
    };
    window.addEventListener("uios:intent-reveal", reveal);
    return () => window.removeEventListener("uios:intent-reveal", reveal);
  }, [interaction, topology]);
  return null;
}
