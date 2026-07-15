# UIOS architecture

## Runtime shape

The reference deployment is one Next.js application:

```text
Browser / SDK
    ↓
Next.js pages + authenticated /api routes
    ↓
UIOS runtime boundary
    ├─ workspace auth, RBAC, rate limits, usage
    ├─ Aegis policy boundary
    ├─ provider-neutral router and gateway
    ├─ agent, workflow, memory, analytics services
    └─ SQLite/JSON adapter for local development
```

The service packages under `services/` and shared contracts under `packages/` are replaceable modules. Production deployments must replace local persistence with managed encrypted storage and put managed identity in front of tenant APIs.

## Request lifecycle

1. Resolve a signed workspace session or API key.
2. Enforce tenant and role authorization.
3. Apply same-origin, rate, usage, and input bounds.
4. Run Aegis policy checks.
5. Route to a healthy provider or fail closed.
6. Record usage/audit evidence and return a sanitized response.

## Visual architecture

`MyceliumField` is currently a code-native high-DPI canvas with deterministic branches, depth-aware projection, pointer parallax, provider nodes, central UIOS core, and reduced-motion handling. A future WebGL/R3F renderer may replace it only after matching accessibility, performance, and fallback behavior.

## Sprint 002 landing composition

The homepage composes two independent client layers: `CinematicFabric` owns the fixed React Three Fiber scene and emits a completion event, while `ProductLanding` owns the post-cinematic copy, capability cards, and waitlist. This avoids tearing down the GPU scene during the transition. Scroll progress is held in refs and consumed by the render loop; cards use CSS transforms rather than React state. The prototype waitlist is intentionally local-only (`uios.waitlist.v1` in browser storage) and can later be replaced by an API adapter without changing the form contract.

## Render engine package

`packages/render-engine` is a presentation-only React Three Fiber package. `SceneManager`, `CameraManager`, and `RenderLoop` own canvas setup, camera controls, adaptive DPR, and one centralized frame dispatcher. Particle, neural-network, crystal-core, interaction, region, and lighting systems are independently mountable components. Crystal, energy, pulse, and background shaders are exported as standalone GLSL modules.

The package contains no product, tenant, provider, or dashboard logic. The isolated `/render-engine` route is a visual integration harness and does not replace the existing Fabric of Intelligence landing renderer. Its 60 FPS strategy is bounded DPR, adaptive quality, memoized GPU buffers, low draw-call counts, and uniform/transform mutation without per-frame React state.

`PerformanceManager` quantizes Drei's runtime performance signal into high, balanced, and economy budgets. Those budgets adjust DPR, the active range within the 5,000-particle allocation, neural node/edge draw ranges, shader complexity, transmission-buffer resolution, and the Intelligence Core's distance-sensitive LOD without reallocating geometry during a frame. The balanced tier draws 62 percent of the particle allocation and the economy tier can fall to the default 2,500-instance floor. The complete six-zone orbit sets the high scene-complexity budget from mount so particles and network detail yield to the semantic systems when needed. Refraction is reserved for the high tier and nearby camera distances, while lower tiers retain the rebuilding shard shell, energy, glow, frame, and lightweight crystalline shell. Particle and neural bounds enable Three.js frustum culling; the particle field remains one indexed instanced draw. Static GPU attributes use static-draw buffers, reconnecting graph attributes use dynamic-draw buffers, and both systems dispose their owned geometry on teardown.

`TextureManager` applies explicit color-space, filtering, anisotropy, wrapping, and mipmap policy. The background uses a reusable 64-by-64 single-channel data texture instead of evaluating a trigonometric random hash for every fragment. Particle and neural fragments use squared radial distance, while particle color cycles are evaluated per vertex and interpolated, reducing fragment shader arithmetic without changing the bloom-compatible output.

The particle layer uses one instanced draw for 5,000 billboard particles spread through an eleven-unit field, keeping the viewport alive without returning to the earlier wall of particles. Static origins, velocity seeds, scale, phase, and speed live in instanced GPU attributes; GLSL performs the organic velocity field, mouse attraction, palette cycling, distance fade, depth fog, and high-dynamic-range additive output used by bloom passes. The background is a camera-independent full-screen shader with frustum and depth testing disabled, so its continuous blue-black field covers every viewport pixel through orbit and region flights without exposing geometry edges. The CPU only updates time and a smoothed mouse-plane coordinate each frame.

The neural-network layer procedurally scatters nodes through a warped volume and connects each node to a bounded set of nearest neighbors. Nodes and edges share the same GLSL deformation field so the graph drifts as one organic structure. Edge growth is staggered, energy packets travel continuously in both primary and echo waves, and topology is re-scored and reconnected on a slow interval without React state updates or per-frame geometry allocation.

The Intelligence Core is a layered icosahedral system: a low-resolution transmission shell provides scene refraction, a non-indexed crystalline shard layer evolves and rebuilds each facet independently in GLSL, and an additive inner field carries flowing energy. Two asynchronously rotating, non-uniform icosahedral frames create the impossible-geometry silhouette, while a back-face shader supplies bloom-compatible volumetric rim light. Per-frame work is limited to rotations and uniform updates.

The camera director runs as one high-priority render task inside the interaction boundary. A single damped composition target blends slow idle orbit, pointer parallax, normalized page depth, user-driven OrbitControls, and region selections. Region flights use quintic cinematic easing and frame the selected region against the central core; new input starts from the camera's current transform, preventing discontinuities. Consumers can inject a ref-backed scroll progress source and custom region coordinates without adding React frame updates.

The interaction system projects the pointer into one shared world-space field and publishes position, velocity-derived intensity, and decaying pulse refs without React frame state. Particle and neural shaders consume those refs to brighten local detail, attract matter, curve subdivided energy edges, and propagate click or movement pulses. Region selection triggers the same pulse, starts the camera director, and opens a composable Drei HTML interface shell; applications can replace that shell through `renderInterface` without putting business logic into the engine.

The Intelligence Core is the non-interactive source of the universe rather than a navigation target. It is intentionally oversized and keeps its independently rebuilding shard shell at every performance tier; high quality adds scene refraction while balanced and economy tiers substitute a lightweight crystalline shell without removing internal energy, impossible frames, or volumetric glow. A second asynchronous energy body increases the apparent dimensional depth without coupling the Core to product state.

`RegionSystem` carries a static presentation-only catalog for the six primary systems: Aegis Security, Shared Memory, Universal Router, Agent Nexus, Knowledge Galaxy, and Integration Port. All six mount together on one spacious orbit around the Core, keeping every zone visible while preserving central breathing room. Each system has a distinct procedural sculpture, accessible HTML label, cinematic camera target, and capability-shell metadata; no provider, tenant, health, or customer state is fabricated.

One dynamic batched line geometry and one dynamic point geometry form a complete energy web between the Core and every pair of regions. Each link is a three-strand bundle of subdivided quadratic curves whose control points drift continuously, producing fluid motion instead of rigid spokes; its violet, electric-blue, and magenta gradient is inherited from the Intelligence Core. The six semantic nodes use white-hot inner lights, two additive crystalline lattice shells, an orbital ring, and a restrained glow volume, matching the reference's compact energy-satellite language while retaining each system's sculpture as a subtle internal signature. Selecting a region triggers the shared particle/neural pulse before its angular interface grows from a narrow seam, visually tying the DOM surface to the scene response. The particle shader separately phases a stable subset of matter into three large sinusoidal filaments between seven and sixteen seconds, allowing the apparently random field to reveal an underlying nervous-system structure without CPU simulation or new draw calls.

The camera starts directly at the wide 14-unit home orbit with no forced zoom reveal. Selecting any primary system starts a 2.6-second quintic flight from the camera's current transform while its generated interface opens, preserving composition without abrupt movement. User orbit distance remains constrained between six and twenty units.

The render-engine preview adds a deliberately minimal glass interface as an independent DOM layer above the canvas. Only the compact engine/status rail and interaction legend remain; explanatory hero copy is omitted so the Core and discovered systems own the composition. Pointer-transparent containers leave the 3D world directly interactive, the overlay collapses into one accessible restore control, and all generated-surface transitions honor the user's reduced-motion preference.
