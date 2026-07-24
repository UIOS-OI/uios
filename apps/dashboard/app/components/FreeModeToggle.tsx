"use client";

import { useSettings } from "@uios/render-engine";

export default function FreeModeToggle() {
  const { freeMode, toggleFreeMode } = useSettings();
  return (
    <button
      onClick={toggleFreeMode}
      className={`fixed top-4 right-4 z-50 px-3 py-2 rounded-lg bg-black bg-opacity-60 backdrop-blur-sm text-white shadow-lg hover:opacity-90 transition`}
    >
      {freeMode ? "Free Mode ON" : "Free Mode OFF"}
    </button>
  );
}
