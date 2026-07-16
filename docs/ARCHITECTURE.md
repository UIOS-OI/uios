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

## Intelligence Universe

The long-term creative and technical contract is defined in `docs/GENESIS_ENGINE.md`. Delivery is milestone-based so the engine gains camera, streaming, current, recursive-world, and region-environment capabilities without collapsing them into one untestable scene rewrite.

The `/` experience is a continuous R3F world, not a set of page transitions. The existing cinematic video remains the entry sequence and fades over an already-mounted universe so the GPU scene is not created during the handoff. The prior `IntelligenceUniverse`, `CinematicFabric`, and `ProductLanding` implementations remain in the repository as earlier visual stages; `UniverseExperience` is the active homepage composition.

`packages/render-engine` is presentation-only. It owns the reusable canvas, centralized render-task loop, camera direction, adaptive performance budget, spatial interaction field, world topology, sector streaming, particles, neural pathways, intelligence currents, semantic regions, lighting, shaders, and post-processing. It contains no tenant authorization or provider-health decisions.

### World topology

`UniverseManager` provides Aegis, Memory, Router, Agent Nexus, Observatory, Forge, and Marketplace as separate star systems positioned 158,000 to 378,000 virtual units from origin. Nodes use parent-relative coordinates in a flat data index and render as a nested scene graph: System → Planet → World → District → Building → Workspace. Every system owns a six-planet category cluster, Memory owns departmental planets, and authenticated providers enter as Router provider worlds. Structural destinations describe product architecture and do not claim that an external service is connected.

The manager calls the same-origin `/api/universe/topology` boundary. That route resolves the signed workspace or API-key tenant on the server; the client does not send or trust a tenant header. In an authenticated workspace, registered provider IDs can become workspace-sourced provider destinations and the tenant's memory record count can influence future knowledge-density rendering. An unauthorized public visitor receives an empty workspace topology and sees only the structural universe; failed requests do not fabricate provider or memory state.

### Navigation and interaction

Regions occupy distinct but practical astronomical coordinate spaces. Selecting a spatial signal starts a GSAP camera flight from the camera's current position, with duration derived from travel distance and eased acceleration/deceleration. Orbit controls are disabled during the flight and restored on arrival. A region interface is mounted only after the flight completes.

Pointer position and interaction intensity live in refs and are consumed by render tasks and shader uniforms. This keeps high-frequency input out of React state. Nearby particles bend and brighten in response, while regions breathe, rotate, and intensify on hover or selection.

### Continuous motion and depth

The scene keeps the prior cinematic, crystal, particle, neural, and shader work and adds a large central Intelligence Core, semantic destination sculptures, post-processing bloom, and curved energy currents from the Core to every active region. Pulse packets continuously cross those curves. Different region geometries communicate security, memory, routing, agents, observability, construction, exchange, and provider roles without generic dashboard panels.

The background renders in clip space, so long camera travel cannot expose a plane edge. Foreground particles, a scaled neural field, currents, region environments, and distant destinations create separate depth bands. Nothing in the live world requires a page transition.

### Living Intelligence Pulse

`UniverseActivityManager` accepts bounded `uios:activity` events containing only a kind, lifecycle phase, structural route IDs, timestamp, and intensity. Agent, chat, memory-read, and memory-write clients emit those events without including prompts, results, document contents, tenant IDs, or secrets. A short-lived session marker allows a recent operation to remain visible when the user returns to the universe.

Pulse packets traverse the named regions, complete routes return toward the Workspace, and failed routes divert through Aegis. The same low-frequency activity state drives current velocity, Core energy, environmental lighting, and calm/flowing/surge/guarded intelligence weather. High-frequency motion remains in refs, Three.js objects, buffers, and shader uniforms rather than React state.

### Performance and streaming

`PerformanceManager` converts Drei's performance factor into high, balanced, and economy budgets. Particle and neural geometries allocate once, then change draw ranges instead of reallocating every frame. DPR is bounded, bloom runs without multisampling, animation mutates Three.js objects and uniforms, and the centralized render loop caps unusually large frame deltas.

Genesis v2 uses an active-universe runtime. `arrivedId` identifies the only fully mounted universe and `selectedId` identifies the requested reality layer. Normal `reveal` navigation performs a short Core/camera manifestation and swaps coordinate spaces without tunnel friction. The separate `cinematic` mode retains fracture/tunnel/floating-origin travel for milestone events dispatched through `uios:cinematic-travel`. Procedural Workspace, Document, Graph, and Token Network children are generated deterministically on demand, so universe count does not increase resident scene memory.

Visual scale is hierarchical as well as structural: every navigable entrance carries a luminous galaxy field, and Memory is the bright atmosphere surrounding massive file-planets and knowledge gems. Background exposure and per-universe nebula colors keep the Core and entrances readable without flattening the scene into conventional UI.

Orbit controls remain active in the Root Universe and every arrived universe. Wheel/pinch movement uses accelerated cursor-directed dolly behavior across the astronomical coordinate ranges; drag orbits, right-drag pans, and clicking an entrance reveals its next reality layer.

The `uios.warp-zoom.v1` preference switches OrbitControls between warp speed (`2.8`) and precision speed (`0.72`). The shell persists the choice locally and broadcasts `uios:warp-zoom`; the render engine owns the actual camera response.

The homepage mounts the universe immediately. Cinematic playback is explicitly user-triggered, and the transparent WebGL canvas sits above a CSS nebula visibility floor so media stalls, shader compilation failures, or context recovery cannot present an all-black first screen.

Navigation remains inside the spatial fabric: there is no fixed screen-space planet constellation competing with the real scene. Each 3D system carries an orbiting content field whose density becomes clearer with approach, while its anchored semantic label and enlarged raycast volume remain clickable. Direct planet activation uses a sub-second camera approach toward the selected entrance, then rebases the same canvas to the child cluster. Memory document gems open the existing reader overlay and never change routes.

The Memory system also receives an allowlisted repository-document catalog from `/api/universe/topology`. Only selected root product documents and `.md`/`.txt` files under `docs/` become clickable artifacts. `/api/universe/document` revalidates the catalog path before reading content, caps the response size, and never exposes environment files, databases, source trees, or arbitrary user-supplied filesystem paths. Artifacts open in a read-only overlay without changing universe depth.

Orbit rotation uses a camera-local Universe target so dragging changes the view without throwing the camera across astronomical distances. Once a destination is reached, depth-specific camera bounds enable wheel/pinch zoom, orbit, and screen-space panning inside that coordinate space. Escape, the Travel Outward control, and the clickable Core traverse navigation history through physical return flights. Destination geometry has a larger invisible raycast volume, while its transparent label expands on geometry proximity or direct label hover; this improves selection without visually enlarging distant tags.

### Accessibility and fallbacks

The cinematic can be skipped, muted, or explicitly started when autoplay is blocked. Reduced-motion users enter the universe without the video transition. Spatial signals are real buttons, region changes are described by accessible DOM, and the minimal status/guidance layer remains readable without claiming live provider health.

## Historical landing composition

Sprint 002 used `CinematicFabric` plus `ProductLanding`, including the local-only `uios.waitlist.v1` prototype. Those files are retained for reference and reuse, but they no longer define the active `/` route.
