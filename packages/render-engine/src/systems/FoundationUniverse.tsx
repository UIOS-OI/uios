"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { usePerformanceBudget } from "../engine/PerformanceManager";
import { useRenderTask } from "../engine/RenderLoop";

export type FoundationUniverseLink = {
  llmLabel: string;
  modelId: string;
  protection: "firewall" | "proxy" | "sidecar";
  connectedAt: number;
};

export type FoundationTrafficSample = {
  id: string;
  at: number;
  kind: "prompt" | "api" | "tool" | "memory" | "workflow";
  verdict: "pass" | "deflect";
  threat?: string;
};

export type FoundationUniverseProps = {
  link: FoundationUniverseLink | null;
  events: FoundationTrafficSample[];
  reducedMotion?: boolean;
};

const EARTH_RADIUS = 4.15;
const SHIELD_RADIUS = 6.55;
const PASS_POOL = 64;
const STRIKE_POOL = 24;
const KIND_COLORS = ["#ffe3a3", "#9ecbff", "#8dffe0", "#d2b6ff", "#ffd0ea"];
const SHIELD_COLORS = {
  firewall: "#3ee0ff",
  proxy: "#8eb6ff",
  sidecar: "#d2c4ff",
} as const;

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) { v += noise(p) * a; p = p * 2.05 + 3.1; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(vView);
    vec2 uv = vec2(vUv.x + 0.13, vUv.y);
    float land = smoothstep(0.46, 0.6, fbm(uv * vec2(5.5, 3.2)));
    float coast = smoothstep(0.42, 0.5, fbm(uv * vec2(5.5, 3.2) + 1.7));
    vec3 ocean = mix(vec3(0.015, 0.05, 0.12), vec3(0.05, 0.16, 0.28), fbm(uv * 9.0));
    vec3 ground = mix(vec3(0.04, 0.16, 0.1), vec3(0.22, 0.28, 0.14), fbm(uv * 12.0));
    vec3 color = mix(ocean, ground, land);
    color = mix(color, vec3(0.35, 0.42, 0.28), coast * (1.0 - land) * 0.45);
    float night = smoothstep(0.35, -0.05, dot(normal, normalize(vec3(0.55, 0.35, 0.75))));
    float cities = smoothstep(0.72, 0.9, fbm(uv * 26.0)) * land * night;
    color += vec3(1.0, 0.78, 0.42) * cities * (0.35 + uActivity * 1.4);
    float clouds = smoothstep(0.58, 0.82, fbm(uv * vec2(3.2, 1.8) + vec2(uTime * 0.012, 0.0)));
    color = mix(color, vec3(0.82, 0.88, 0.95), clouds * 0.42);
    float diff = max(dot(normal, normalize(vec3(0.45, 0.62, 0.55))), 0.0);
    color *= 0.18 + diff * 1.05;
    float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
    color += vec3(0.45, 0.78, 1.0) * rim * 0.7;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const SHIELD_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHIELD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uMode;
  uniform vec3 uImpact;
  uniform float uImpactStrength;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
  }
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(vView);
    float fres = pow(1.0 - abs(dot(normal, view)), 2.15);
    vec2 uv = vec2(atan(normal.z, normal.x), asin(clamp(normal.y, -1.0, 1.0)));
    float pattern = 0.0;
    if (uMode < 0.5) {
      vec2 grid = uv * vec2(9.5, 6.2);
      float cell = hexDist(grid);
      pattern = smoothstep(0.16, 0.02, abs(fract(cell) - 0.12));
    } else if (uMode < 1.5) {
      float flow = sin(uv.x * 7.0 + uTime * 0.7) * sin(uv.y * 5.0 - uTime * 0.4);
      pattern = smoothstep(0.2, 0.85, flow * 0.5 + 0.5);
    } else {
      float nodes = pow(max(sin(uv.x * 5.0), 0.0) * max(sin(uv.y * 4.0 + uTime * 0.25), 0.0), 1.4);
      pattern = smoothstep(0.15, 0.7, nodes);
    }
    float hit = 0.0;
    if (uImpactStrength > 0.001) {
      float d = distance(normalize(uImpact), normal);
      hit = exp(-d * d * 22.0) * uImpactStrength;
    }
    float alpha = clamp(0.035 + fres * 0.62 + pattern * 0.34 + hit, 0.0, 1.0);
    vec3 color = uColor * (0.45 + pattern * 0.9 + fres) + vec3(1.0, 0.42, 0.32) * hit * 1.6;
    gl_FragColor = vec4(color, alpha);
  }
`;

function hashUnit(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function makeStarfield(count: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let state = 17;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const radius = 80 + rand() ** 0.45 * 1500;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    color.setHSL(rand() > 0.82 ? 0.08 : 0.58, 0.35, 0.62 + rand() * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function FoundationUniverse({ link, events, reducedMotion = false }: FoundationUniverseProps) {
  const budget = usePerformanceBudget();
  const world = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const shield = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const shock = useRef<THREE.Mesh>(null);
  const sentinels = useRef<THREE.Group>(null);
  const passes = useRef<THREE.InstancedMesh>(null);
  const strikes = useRef<THREE.InstancedMesh>(null);
  const passIds = useRef<(string | null)[]>(Array.from({ length: PASS_POOL }, () => null));
  const passKind = useRef(new Uint8Array(PASS_POOL));
  const passSeed = useRef(new Float32Array(PASS_POOL));
  const strikeIds = useRef<(string | null)[]>(Array.from({ length: STRIKE_POOL }, () => null));
  const strikeSeed = useRef(new Float32Array(STRIKE_POOL));
  const strikePrev = useRef(new Float32Array(STRIKE_POOL));
  const dir = useRef(new THREE.Vector3());
  const axis = useRef(new THREE.Vector3());
  const pos = useRef(new THREE.Vector3());
  const ahead = useRef(new THREE.Vector3());
  const dummy = useRef(new THREE.Object3D());
  const yAxis = useRef(new THREE.Vector3(0, 1, 0));
  const xAxis = useRef(new THREE.Vector3(1, 0, 0));
  const tint = useRef(new THREE.Color());
  const eventsRef = useRef(events);
  const linkRef = useRef(link);
  const reducedRef = useRef(reducedMotion);
  eventsRef.current = events;
  linkRef.current = link;
  reducedRef.current = reducedMotion;

  const earthUniforms = useMemo(() => ({ uTime: { value: 0 }, uActivity: { value: 0.2 } }), []);
  const shieldUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMode: { value: 0 },
      uImpact: { value: new THREE.Vector3(0, 1, 0) },
      uImpactStrength: { value: 0 },
      uColor: { value: new THREE.Color(SHIELD_COLORS.firewall) },
    }),
    [],
  );
  const starGeometry = useMemo(() => makeStarfield(Math.max(900, Math.round(2600 * budget.particleScale))), [budget.particleScale]);
  const earthGeometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS, 64, 48), []);
  const cloudGeometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS * 1.035, 40, 28), []);
  const shieldGeometry = useMemo(() => new THREE.SphereGeometry(SHIELD_RADIUS, 56, 40), []);
  const atmoGeometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS * 1.16, 36, 24), []);
  const passGeometry = useMemo(() => new THREE.SphereGeometry(0.42, 10, 8), []);
  const strikeGeometry = useMemo(() => new THREE.OctahedronGeometry(0.62, 0), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(SHIELD_RADIUS + 0.85, 0.035, 12, 96), []);
  const shockGeometry = useMemo(() => new THREE.RingGeometry(0.2, 0.55, 48), []);

  useLayoutEffect(() => {
    const hide = (mesh: THREE.InstancedMesh | null, count: number) => {
      if (!mesh) return;
      for (let i = 0; i < count; i += 1) {
        dummy.current.position.set(0, 0, 0);
        dummy.current.scale.set(0, 0, 0);
        dummy.current.updateMatrix();
        mesh.setMatrixAt(i, dummy.current.matrix);
        mesh.setColorAt(i, tint.current.set("#ffffff"));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    hide(passes.current, PASS_POOL);
    hide(strikes.current, STRIKE_POOL);
  }, []);

  useLayoutEffect(() => () => {
    starGeometry.dispose();
    earthGeometry.dispose();
    cloudGeometry.dispose();
    shieldGeometry.dispose();
    atmoGeometry.dispose();
    passGeometry.dispose();
    strikeGeometry.dispose();
    ringGeometry.dispose();
    shockGeometry.dispose();
  }, [atmoGeometry, cloudGeometry, earthGeometry, passGeometry, ringGeometry, shieldGeometry, shockGeometry, starGeometry, strikeGeometry]);

  useLayoutEffect(() => {
    const mode = link?.protection === "proxy" ? 1 : link?.protection === "sidecar" ? 2 : 0;
    shieldUniforms.uMode.value = mode;
    shieldUniforms.uColor.value.set(link ? SHIELD_COLORS[link.protection] : SHIELD_COLORS.firewall);
    if (sentinels.current) sentinels.current.visible = link?.protection === "sidecar";
    if (ring.current) {
      const material = ring.current.material as THREE.MeshBasicMaterial;
      material.color.set(link ? SHIELD_COLORS[link.protection] : SHIELD_COLORS.firewall);
    }
  }, [link, shieldUniforms]);

  useLayoutEffect(() => {
    const live = new Set(events.map((event) => event.id));
    const claim = (
      ids: (string | null)[],
      mesh: THREE.InstancedMesh | null,
      incoming: FoundationTrafficSample[],
      paint: (index: number, event: FoundationTrafficSample) => void,
    ) => {
      for (let i = 0; i < ids.length; i += 1) {
        if (ids[i] && !live.has(ids[i] as string)) ids[i] = null;
      }
      for (const event of incoming) {
        if (ids.includes(event.id)) continue;
        const slot = ids.findIndex((id) => id === null);
        if (slot < 0) break;
        ids[slot] = event.id;
        paint(slot, event);
        if (mesh) {
          tint.current.set(event.verdict === "deflect" ? "#ff5d6e" : KIND_COLORS[kindIndex(event.kind)]);
          mesh.setColorAt(slot, tint.current);
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
    };
    claim(passIds.current, passes.current, events.filter((event) => event.verdict === "pass"), (index, event) => {
      passKind.current[index] = kindIndex(event.kind);
      passSeed.current[index] = hashUnit(event.id);
    });
    claim(strikeIds.current, strikes.current, events.filter((event) => event.verdict === "deflect"), (index, event) => {
      strikeSeed.current[index] = hashUnit(event.id);
      strikePrev.current[index] = hashUnit(event.id);
    });
  }, [events]);

  useRenderTask("foundation-universe", (_state, delta) => {
    const current = linkRef.current;
    const motion = reducedRef.current ? 0 : delta;
    earthUniforms.uTime.value += motion;
    shieldUniforms.uTime.value += motion;
    shieldUniforms.uImpactStrength.value = Math.max(0, shieldUniforms.uImpactStrength.value - motion * 0.85);
    if (world.current) {
      const birth = !current ? 0.02 : reducedRef.current ? 1 : Math.min(1, (Date.now() - current.connectedAt) / 1800);
      const scale = birth * birth * (1 - birth) * 0.15 + birth;
      world.current.visible = Boolean(current);
      world.current.scale.setScalar(Math.max(current ? 0.001 : 0, scale));
    }
    if (earth.current) earth.current.rotation.y += motion * 0.07;
    if (clouds.current) clouds.current.rotation.y += motion * 0.11;
    if (ring.current) ring.current.rotation.z += motion * 0.18;
    if (sentinels.current) sentinels.current.rotation.y += motion * 0.35;
    if (shock.current) {
      const strength = shieldUniforms.uImpactStrength.value;
      shock.current.visible = strength > 0.04;
      shock.current.scale.setScalar(1 + (1 - strength) * 3.4);
      (shock.current.material as THREE.MeshBasicMaterial).opacity = strength * 0.85;
      shock.current.position.copy(shieldUniforms.uImpact.value).normalize().multiplyScalar(SHIELD_RADIUS);
      shock.current.lookAt(0, 0, 0);
    }
    const elapsed = earthUniforms.uTime.value;
    placePasses(elapsed);
    placeStrikes(elapsed);
  }, 1);

  function placeBody(seed: number, phase: number, lane: number, flyby: boolean, target: THREE.Vector3) {
    dir.current.set(0, 0, 0);
    const theta = seed * Math.PI * 2;
    const phi = Math.acos(2 * ((seed * 13.137) % 1) - 1);
    dir.current.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.62, Math.sin(phi) * Math.sin(theta)).normalize();
    axis.current.crossVectors(dir.current, Math.abs(dir.current.y) > 0.82 ? xAxis.current : yAxis.current).normalize();
    if (flyby) {
      const peri = 8.4 + lane * 3.6;
      const far = 76;
      const radius = far - Math.sin(phase * Math.PI) * (far - peri);
      const angle = (phase - 0.5) * 2.45;
      target.copy(dir.current).applyAxisAngle(axis.current, angle).multiplyScalar(radius);
      return false;
    }
    const impact = 0.62;
    if (phase < impact) {
      target.copy(dir.current).multiplyScalar(78 + (SHIELD_RADIUS - 78) * (phase / impact));
      return false;
    }
    const after = (phase - impact) / (1 - impact);
    target.copy(dir.current).applyAxisAngle(axis.current, (0.7 + lane * 1.15) * Math.min(1, after * 1.15)).multiplyScalar(SHIELD_RADIUS + after * 70);
    return true;
  }

  function placePasses(elapsed: number) {
    const mesh = passes.current;
    if (!mesh) return;
    let active = 0;
    for (let i = 0; i < PASS_POOL; i += 1) {
      const id = passIds.current[i];
      if (!id) {
        dummy.current.scale.set(0, 0, 0);
        dummy.current.updateMatrix();
        mesh.setMatrixAt(i, dummy.current.matrix);
        continue;
      }
      active += 1;
      const seed = passSeed.current[i];
      const phase = reducedRef.current ? 0.42 + (seed % 0.2) : (elapsed * 0.16 + seed) % 1;
      placeBody(seed, phase, seed * 4, true, pos.current);
      placeBody(seed, Math.min(0.999, phase + 0.015), seed * 4, true, ahead.current);
      dummy.current.position.copy(pos.current);
      dummy.current.lookAt(ahead.current);
      const stretch = 0.7 + pos.current.distanceTo(ahead.current) * 6.5;
      dummy.current.scale.set(1, 1, Math.min(7.5, stretch));
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
    }
    earthUniforms.uActivity.value = THREE.MathUtils.lerp(earthUniforms.uActivity.value, Math.min(1, active / 12), 0.08);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function placeStrikes(elapsed: number) {
    const mesh = strikes.current;
    if (!mesh) return;
    for (let i = 0; i < STRIKE_POOL; i += 1) {
      const id = strikeIds.current[i];
      if (!id) {
        dummy.current.scale.set(0, 0, 0);
        dummy.current.updateMatrix();
        mesh.setMatrixAt(i, dummy.current.matrix);
        continue;
      }
      const seed = strikeSeed.current[i];
      const phase = reducedRef.current ? 0.7 : (elapsed * 0.22 + seed) % 1;
      const previous = strikePrev.current[i];
      const impacted = placeBody(seed, phase, (seed * 5) % 1, false, pos.current);
      if (!reducedRef.current && previous < 0.62 && phase >= 0.62) {
        shieldUniforms.uImpact.value.copy(dir.current);
        shieldUniforms.uImpactStrength.value = 1;
      }
      strikePrev.current[i] = phase;
        dummy.current.position.copy(pos.current);
      dummy.current.lookAt(0, 0, 0);
      dummy.current.scale.setScalar(impacted ? 1.15 : 0.85);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return (
    <>
      <color attach="background" args={["#01030a"]} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[12, 10, 8]} intensity={1.35} color="#fff4e2" />
      <pointLight position={[-8, -3, 6]} intensity={8} distance={40} color="#3ec8ff" />
      <points geometry={starGeometry}>
        <pointsMaterial vertexColors size={1.15} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
      <mesh visible={!link}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial color="#14324a" wireframe />
      </mesh>
      <group ref={world} visible={Boolean(link)}>
        <mesh ref={earth} geometry={earthGeometry}>
          <shaderMaterial uniforms={earthUniforms} vertexShader={EARTH_VERT} fragmentShader={EARTH_FRAG} />
        </mesh>
        <mesh ref={clouds} geometry={cloudGeometry}>
          <meshBasicMaterial color="#d5e4ff" transparent opacity={0.08} depthWrite={false} />
        </mesh>
        <mesh geometry={atmoGeometry}>
          <meshBasicMaterial color="#69d6ff" transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={shield} geometry={shieldGeometry}>
          <shaderMaterial
            uniforms={shieldUniforms}
            vertexShader={SHIELD_VERT}
            fragmentShader={SHIELD_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={ring} geometry={ringGeometry} rotation={[Math.PI / 2.4, 0.2, 0]}>
          <meshBasicMaterial color={SHIELD_COLORS.firewall} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <group ref={sentinels}>
          {Array.from({ length: 6 }, (_, index) => {
            const angle = (index / 6) * Math.PI * 2;
            const radius = SHIELD_RADIUS + 1.35;
            return (
              <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(angle * 0.35) * 0.8, Math.sin(angle) * radius]}>
                <sphereGeometry args={[0.16, 12, 12]} />
                <meshBasicMaterial color="#efe8ff" />
              </mesh>
            );
          })}
        </group>
        <mesh ref={shock} geometry={shockGeometry} visible={false}>
          <meshBasicMaterial color="#ffb199" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <instancedMesh ref={passes} args={[passGeometry, undefined, PASS_POOL]} frustumCulled={false}>
          <meshBasicMaterial color="#ffe7b8" toneMapped={false} />
        </instancedMesh>
        <instancedMesh ref={strikes} args={[strikeGeometry, undefined, STRIKE_POOL]} frustumCulled={false}>
          <meshBasicMaterial color="#ff5d6e" toneMapped={false} />
        </instancedMesh>
      </group>
    </>
  );
}

function kindIndex(kind: FoundationTrafficSample["kind"]) {
  if (kind === "api") return 1;
  if (kind === "tool") return 2;
  if (kind === "memory") return 3;
  if (kind === "workflow") return 4;
  return 0;
}
