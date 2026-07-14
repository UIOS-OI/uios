# Layer 10 — Cinematic User Interface

UIOS uses a unified, space-themed user interface rather than modular dashboards. Users interact with the platform within the "UIOS Universe," a React Three Fiber 3D scene representing the Fabric of Intelligence.

---

## 🎨 Layout & Architecture

```text
+-------------------------------------------------------------+
|  UIOS Brand               LIVE FABRIC           Sound/Reset |
+-------------------------------------------------------------+
|                                             +-------------+ |
|                                             | Explore     | |
|                                             | 01 Core     | |
|                     3D CANVAS               | 02 Router   | |
|                (Fabric of Intelligence)     | 03 Aegis    | |
|                                             | 04 Memory   | |
|                                             +-------------+ |
|                                                             |
| +-----------------+                                         |
| | Zone Details    |                                         |
| | Title / Category|                                         |
| | Description     |                                         |
| +-----------------+                                         |
+-------------------------------------------------------------+
```

### 1. The Visual Canvas
- **Unified Navigation Space**: Clicking a navigation target (Aegis, Router, Memory, Core) does not open a static menu. Instead, the 3D viewport initiates a Bezier camera swoop, orbiting and zooming into the target node, while the client pane transitions on top.
- **Glassmorphism design**: Control overlay panes utilize modern styling variables (blur, subtle transparency, glowing borders) to blend with the background galaxy scene.

### 2. Interaction Design Guidelines
- **Hover Magnet Effects**: Interactive canvas nodes exert a subtle pull vector on the pointer, bending nearby mycelium links toward the cursor to represent connection pathways.
- **Reduced Motion Support**: Employs media queries (`prefers-reduced-motion: reduce`) and system flags to disable WebGL rotations, canvas particles, and camera sweeps, instantly rendering static fallback states for accessibility.
- **Sound Interface Controls**: Crystalline pentatonic chimes respond to node transitions. The system integrates a mute state (`muted = true` by default) with manual toggles to ensure compliance with browser autoplay restrictions.
- **Micro-Animations**: Hover actions trigger scaling shifts, and glowing keyframes emphasize active execution pathways, providing immediate interaction feedback.
