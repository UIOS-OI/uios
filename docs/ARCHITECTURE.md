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
