import { create } from 'zustand';

type SettingsState = {
  primaryHue: number;
  freeMode: boolean;
  toggleFreeMode: () => void;
  setPrimaryHue: (hue: number) => void;
  /** Camera control settings */
  cameraSpeed: number; // multiplier for look speed
  cameraInertia: number; // damping factor for velocity
  zoomFactor: number; // base zoom factor
  setCameraSpeed: (v: number) => void;
  setCameraInertia: (v: number) => void;
  setZoomFactor: (v: number) => void;
  /** Voice command */
  voiceEnabled: boolean;
  toggleVoice: () => void;
};

export const useSettings = create<SettingsState>((set) => ({
  primaryHue: 200,
  freeMode: false,
  toggleFreeMode: () => set((s) => ({ freeMode: !s.freeMode })),
  setPrimaryHue: (hue) => set({ primaryHue: hue }),
  cameraSpeed: 1,
  cameraInertia: 0.8,
  zoomFactor: 0.005,
  setCameraSpeed: (v) => set({ cameraSpeed: v }),
  setCameraInertia: (v) => set({ cameraInertia: v }),
  setZoomFactor: (v) => set({ zoomFactor: v }),
  voiceEnabled: false,
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
}));
