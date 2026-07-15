import type { Metadata } from "next";
import { RenderEnginePreview } from "./render-engine-preview";

export const metadata: Metadata = {
  title: "UIOS Render Engine",
  description: "A modular real-time rendering engine for the UIOS visual language.",
};

export default function RenderEnginePage() {
  return <RenderEnginePreview />;
}
