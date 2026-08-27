"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { usePerformanceBudget } from "../engine/PerformanceManager";
import { useRenderTask } from "../engine/RenderLoop";
import {
  atmosphereFragmentShader,
  coronaFragmentShader,
  debrisFragmentShader,
  debrisVertexShader,
  diskFragmentShader,
  diskVertexShader,
  jetFragmentShader,
  jetVertexShader,
  lensFragmentShader,
  nebulaFragmentShader,
  nebulaVertexShader,
  planetFragmentShader,
  planetVertexShader,
  ringFragmentShader,
  ringVertexShader,
  shockFragmentShader,
  starFragmentShader,
  starVertexShader,
  sunFragmentShader,
  sunVertexShader,
} from "../shaders/Cosmos";
import {
  CosmosSim,
  DEBRIS_MAX,
  FLAG_GAS,
  FLAG_ICE,
  FLAG_RINGS,
  KIND_COMET,
  KIND_HOLE,
  KIND_PULSAR,
  KIND_REMNANT,
  KIND_STAR,
  MAX_BODIES,
  TRAIL_LENGTH,
  type SpawnKind,
} from "./cosmos-sim";

const STAR_POOL = 18;
const HOLE_POOL = 10;
const PULSAR_POOL = 8;
const LIGHT_POOL = 6;
const STAR_HUE_COLORS = ["#ffb45c", "#ffe7a8", "#9ec8ff", "#7aa7ff", "#ffd0c4", "#ff8a4c", "#c9f0ff"];
const NEBULAS = [
  { color: "#3a1a68", position: [-210000, 18000, 90000] as const, scale: 210000 },
  { color: "#123a5c", position: [160000, -22000, -140000] as const, scale: 180000 },
  { color: "#4a1238", position: [40000, 48000, 210000] as const, scale: 165000 },
  { color: "#14224a", position: [-40000, -36000, -80000] as const, scale: 240000 },
];

function makeStarfield(count: number, inner: number, outer: number, flatten: number, seed: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  let state = seed;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const radius = inner + (outer - inner) * rand() ** 0.52;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * flatten;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const roll = rand();
    color.setHSL(roll > 0.88 ? 0.08 : roll > 0.62 ? 0.58 : 0.14, 0.42, 0.68 + rand() * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    scales[i] = 2.2 + rand() * 10 + radius / 130000;
  }
  return { positions, colors, scales };
}

function makeLifeField(count: number, seed: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const centers = [
    new THREE.Vector3(-210000, 18000, 90000),
    new THREE.Vector3(160000, -22000, -140000),
    new THREE.Vector3(40000, 48000, 210000),
  ];
  let state = seed;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const center = centers[i % centers.length];
    const radius = 8000 + rand() * 48000;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = center.x + radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = center.y + radius * Math.cos(phi) * 0.42;
    positions[i * 3 + 2] = center.z + radius * Math.sin(phi) * Math.sin(theta);
    color.setHSL(0.42 + rand() * 0.2, 0.85, 0.52 + rand() * 0.28);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    scales[i] = 3.2 + rand() * 6.5;
  }
  return { positions, colors, scales };
}

function bodyColor(kind: number, hue: number, heat: number, flags: number, target: THREE.Color) {
  if (kind === KIND_STAR) return target.setHSL(hue, 0.58, 0.62 + heat * 0.22);
  if (kind === KIND_PULSAR) return target.setHSL(0.57, 0.75, 0.72 + heat * 0.2);
  if (kind === KIND_HOLE) return target.setRGB(0.02, 0.01, 0.03);
  if (kind === KIND_COMET) return target.setHSL(0.54, 0.72, 0.72 + heat * 0.15);
  if (kind === KIND_REMNANT) return target.setHSL(0.07, 0.78, 0.42 + heat * 0.4);
  if (flags & FLAG_ICE) return target.setHSL(0.55, 0.25, 0.72);
  if (flags & FLAG_GAS) return target.setHSL(hue, 0.48, 0.52);
  return target.setHSL(hue, 0.52, 0.46);
}

type OrbitControlsLike = { target: THREE.Vector3 };

export function CosmosSandbox() {
  const sim = useMemo(() => new CosmosSim(), []);
  const budget = usePerformanceBudget();
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const tool = useRef<SpawnKind>("star");
  const dragFrom = useRef(-1);
  const pointerStart = useRef({ x: 0, y: 0 });
  const pointerDownAt = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const worlds = useRef<THREE.InstancedMesh>(null);
  const atmospheres = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const instanceColors = useMemo(() => new Float32Array(MAX_BODIES * 3), []);
  const instanceMeta = useMemo(() => new Float32Array(MAX_BODIES * 3), []);
  const ringColors = useMemo(() => new Float32Array(MAX_BODIES * 3), []);
  const starGroups = useRef<(THREE.Group | null)[]>([]);
  const holeGroups = useRef<(THREE.Group | null)[]>([]);
  const pulsarGroups = useRef<(THREE.Group | null)[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const lightIds = useMemo(() => new Int16Array(LIGHT_POOL), []);
  const lightScores = useMemo(() => new Float32Array(LIGHT_POOL), []);
  const flashes = useRef<(THREE.Mesh | null)[]>([]);
  const shocks = useRef<(THREE.Mesh | null)[]>([]);
  const trail = useRef<THREE.Points>(null);
  const debris = useRef<THREE.Points>(null);
  const trailPositions = useMemo(() => new Float32Array(MAX_BODIES * TRAIL_LENGTH * 3), []);
  const debrisPositions = useMemo(() => new Float32Array(DEBRIS_MAX * 3), []);
  const debrisColors = useMemo(() => new Float32Array(DEBRIS_MAX * 3), []);
  const debrisLife = useMemo(() => new Float32Array(DEBRIS_MAX), []);
  const diskField = useMemo(() => makeStarfield(36000, 70000, 2400000, 0.16, 17), []);
  const haloField = useMemo(() => makeStarfield(24000, 160000, 3000000, 0.92, 91), []);
  const lifeField = useMemo(() => makeLifeField(5200, 44), []);
  const diskGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(diskField.positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(diskField.colors, 3));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(diskField.scales, 1));
    return geometry;
  }, [diskField]);
  const haloGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(haloField.positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(haloField.colors, 3));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(haloField.scales, 1));
    return geometry;
  }, [haloField]);
  const lifeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(lifeField.positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(lifeField.colors, 3));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(lifeField.scales, 1));
    return geometry;
  }, [lifeField]);
  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    return geometry;
  }, [trailPositions]);
  const debrisGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(debrisPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(debrisColors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aLife", new THREE.BufferAttribute(debrisLife, 1).setUsage(THREE.DynamicDrawUsage));
    return geometry;
  }, [debrisColors, debrisLife, debrisPositions]);
  const planetGeometry = useMemo(() => new THREE.SphereGeometry(1, 32, 24), []);
  const atmoGeometry = useMemo(() => new THREE.SphereGeometry(1, 20, 16), []);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(1.55, 2.7, 64), []);
  const starUniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), []);
  const debrisUniforms = useMemo(() => ({ uPixelRatio: { value: 1 } }), []);
  const planetUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLightA: { value: new THREE.Vector3(0, 8000, 28000) },
      uLightB: { value: new THREE.Vector3(120000, 0, 0) },
      uLightC: { value: new THREE.Vector3(-120000, 0, 0) },
    }),
    [],
  );
  const ringUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const nebulaUniforms = useMemo(
    () => NEBULAS.map((nebula) => ({ uColor: { value: new THREE.Color(nebula.color) }, uTime: { value: 0 } })),
    [],
  );

  const sunMaterials = useMemo(
    () =>
      Array.from({ length: STAR_POOL }, (_, i) =>
        new THREE.ShaderMaterial({
          vertexShader: sunVertexShader,
          fragmentShader: sunFragmentShader,
          uniforms: {
            uColor: { value: new THREE.Color(STAR_HUE_COLORS[i % STAR_HUE_COLORS.length]) },
            uTime: { value: 0 },
            uHeat: { value: 0 },
          },
        }),
      ),
    [],
  );
  const coronaMaterials = useMemo(
    () =>
      Array.from({ length: STAR_POOL }, (_, i) =>
        new THREE.ShaderMaterial({
          vertexShader: sunVertexShader,
          fragmentShader: coronaFragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          uniforms: {
            uColor: { value: new THREE.Color(STAR_HUE_COLORS[i % STAR_HUE_COLORS.length]) },
            uTime: { value: 0 },
            uHeat: { value: 0 },
          },
        }),
      ),
    [],
  );
  const diskMaterials = useMemo(
    () =>
      Array.from({ length: HOLE_POOL }, () =>
        new THREE.ShaderMaterial({
          vertexShader: diskVertexShader,
          fragmentShader: diskFragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uColor: { value: new THREE.Color("#ff9a4a") },
            uTime: { value: 0 },
            uHeat: { value: 0 },
          },
        }),
      ),
    [],
  );
  const lensMaterials = useMemo(
    () =>
      Array.from({ length: HOLE_POOL }, () =>
        new THREE.ShaderMaterial({
          vertexShader: sunVertexShader,
          fragmentShader: lensFragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
        }),
      ),
    [],
  );
  const jetMaterials = useMemo(
    () =>
      Array.from({ length: HOLE_POOL + PULSAR_POOL }, () =>
        new THREE.ShaderMaterial({
          vertexShader: jetVertexShader,
          fragmentShader: jetFragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uColor: { value: new THREE.Color("#9ecbff") },
            uTime: { value: 0 },
          },
        }),
      ),
    [],
  );
  const pulsarMaterials = useMemo(
    () =>
      Array.from({ length: PULSAR_POOL }, () =>
        new THREE.ShaderMaterial({
          vertexShader: sunVertexShader,
          fragmentShader: sunFragmentShader,
          uniforms: {
            uColor: { value: new THREE.Color("#b7e4ff") },
            uTime: { value: 0 },
            uHeat: { value: 1 },
          },
        }),
      ),
    [],
  );
  const shockMaterials = useMemo(
    () =>
      Array.from({ length: 10 }, () =>
        new THREE.ShaderMaterial({
          vertexShader: sunVertexShader,
          fragmentShader: shockFragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          uniforms: {
            uColor: { value: new THREE.Color("#ffe6b8") },
            uAge: { value: 0 },
          },
        }),
      ),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "1") tool.current = "star";
      if (event.key === "2") tool.current = "planet";
      if (event.key === "3") tool.current = "comet";
      if (event.key === "4") tool.current = "hole";
      if (event.key === "5") tool.current = "pulsar";
      if (event.key === "6") tool.current = "binary";
      if (event.key === "r" || event.key === "R") sim.reset();
      if (event.key === "f" || event.key === "F") sim.toggleFollow();
      if (event.key === " ") {
        event.preventDefault();
        sim.togglePause();
      }
      if (event.key === "]") sim.nudgeTime(1);
      if (event.key === "[") sim.nudgeTime(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim]);

  useEffect(() => {
    const scale = budget.tier === "economy" ? 0.38 : budget.tier === "balanced" ? 0.68 : 1;
    diskGeometry.setDrawRange(0, Math.floor(36000 * scale));
    haloGeometry.setDrawRange(0, Math.floor(24000 * scale));
    lifeGeometry.setDrawRange(0, Math.floor(5200 * scale));
  }, [budget.tier, diskGeometry, haloGeometry, lifeGeometry]);

  useEffect(() => () => {
    for (const material of sunMaterials) material.dispose();
    for (const material of coronaMaterials) material.dispose();
    for (const material of diskMaterials) material.dispose();
    for (const material of lensMaterials) material.dispose();
    for (const material of jetMaterials) material.dispose();
    for (const material of pulsarMaterials) material.dispose();
    for (const material of shockMaterials) material.dispose();
    diskGeometry.dispose();
    haloGeometry.dispose();
    lifeGeometry.dispose();
    trailGeometry.dispose();
    debrisGeometry.dispose();
    planetGeometry.dispose();
    atmoGeometry.dispose();
    ringGeometry.dispose();
  }, [atmoGeometry, coronaMaterials, debrisGeometry, diskGeometry, diskMaterials, haloGeometry, jetMaterials, lensMaterials, lifeGeometry, planetGeometry, pulsarMaterials, ringGeometry, shockMaterials, sunMaterials, trailGeometry]);

  useLayoutEffect(() => {
    const colorAttr = new THREE.InstancedBufferAttribute(instanceColors, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const metaAttr = new THREE.InstancedBufferAttribute(instanceMeta, 3);
    metaAttr.setUsage(THREE.DynamicDrawUsage);
    const ringColorAttr = new THREE.InstancedBufferAttribute(ringColors, 3);
    ringColorAttr.setUsage(THREE.DynamicDrawUsage);
    if (worlds.current) {
      worlds.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      worlds.current.instanceColor = colorAttr;
      planetGeometry.setAttribute("aMeta", metaAttr);
    }
    if (atmospheres.current) {
      atmospheres.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      atmospheres.current.instanceColor = colorAttr;
      atmoGeometry.setAttribute("aMeta", metaAttr);
    }
    if (rings.current) {
      rings.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rings.current.instanceColor = ringColorAttr;
    }
  }, [atmoGeometry, instanceColors, instanceMeta, planetGeometry, ringColors]);

  const beginDrag = (index: number, clientX: number, clientY: number) => {
    dragFrom.current = index;
    sim.lastBody = index;
    pointerStart.current = { x: clientX, y: clientY };
    pointerDownAt.current = performance.now();
  };

  const finishPointer = (point: THREE.Vector3, event: PointerEvent | MouseEvent, shiftKey: boolean) => {
    const moved = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
    if (dragFrom.current >= 0 && moved > 14) {
      sim.launchFrom(dragFrom.current, point.x, point.y, point.z);
      dragFrom.current = -1;
      return;
    }
    dragFrom.current = -1;
    if (moved > 8) return;
    const charge = Math.min(1, (performance.now() - pointerDownAt.current) / 1100);
    sim.spawnTool(shiftKey ? "hole" : tool.current, point.x, point.y, point.z, charge);
  };

  useRenderTask("cosmos-sim", (state, delta, elapsed) => {
    sim.step(delta);
    sim.syncVisualSlots();
    starUniforms.uTime.value = elapsed;
    starUniforms.uPixelRatio.value = gl.getPixelRatio();
    debrisUniforms.uPixelRatio.value = gl.getPixelRatio();
    planetUniforms.uTime.value = elapsed;
    ringUniforms.uTime.value = elapsed;
    for (const uniforms of nebulaUniforms) uniforms.uTime.value = elapsed;

    const mesh = worlds.current;
    const atmo = atmospheres.current;
    const ringMesh = rings.current;
    dummy.rotation.set(0, 0, 0);
    if (mesh) {
      for (let n = 0; n < sim.instanceCount; n++) {
        const i = sim.instanceToBody[n];
        dummy.position.set(sim.px[i], sim.py[i], sim.pz[i]);
        dummy.scale.setScalar(sim.radius[i]);
        dummy.rotation.set(0.4, sim.spin[i], sim.spin[i] * 0.28);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        bodyColor(sim.kind[i], sim.hue[i], sim.heat[i], sim.flags[i], tint);
        instanceColors[n * 3] = tint.r;
        instanceColors[n * 3 + 1] = tint.g;
        instanceColors[n * 3 + 2] = tint.b;
        instanceMeta[n * 3] = sim.flags[i] & FLAG_GAS ? 1 : 0;
        instanceMeta[n * 3 + 1] = sim.heat[i];
        instanceMeta[n * 3 + 2] = sim.flags[i] & FLAG_ICE ? 1 : 0;
        if (atmo) {
          dummy.scale.setScalar(sim.radius[i] * (sim.kind[i] === KIND_COMET ? 1.35 : 1.16));
          dummy.updateMatrix();
          atmo.setMatrixAt(n, dummy.matrix);
        }
        if (ringMesh) {
          if (sim.flags[i] & FLAG_RINGS) {
            dummy.scale.setScalar(sim.radius[i]);
            dummy.rotation.set(Math.PI / 2.3, sim.spin[i] * 0.2, 0.18);
            dummy.updateMatrix();
            ringMesh.setMatrixAt(n, dummy.matrix);
            ringColors[n * 3] = tint.r;
            ringColors[n * 3 + 1] = tint.g;
            ringColors[n * 3 + 2] = tint.b;
          } else {
            dummy.scale.setScalar(0);
            dummy.position.set(0, -1e9, 0);
            dummy.updateMatrix();
            ringMesh.setMatrixAt(n, dummy.matrix);
          }
        }
      }
      dummy.scale.setScalar(0);
      dummy.position.set(0, -1e9, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      for (let n = sim.instanceCount; n < MAX_BODIES; n++) {
        mesh.setMatrixAt(n, dummy.matrix);
        atmo?.setMatrixAt(n, dummy.matrix);
        ringMesh?.setMatrixAt(n, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const meta = planetGeometry.getAttribute("aMeta") as THREE.BufferAttribute | undefined;
      if (meta) meta.needsUpdate = true;
      mesh.count = Math.max(1, sim.instanceCount);
      if (atmo) {
        atmo.instanceMatrix.needsUpdate = true;
        if (atmo.instanceColor) atmo.instanceColor.needsUpdate = true;
        atmo.count = Math.max(1, sim.instanceCount);
      }
      if (ringMesh) {
        ringMesh.instanceMatrix.needsUpdate = true;
        if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
        ringMesh.count = Math.max(1, sim.instanceCount);
      }
    }

    for (let n = 0; n < STAR_POOL; n++) {
      const group = starGroups.current[n];
      const body = sim.starSlots[n];
      const sun = sunMaterials[n];
      const corona = coronaMaterials[n];
      if (!group) continue;
      if (body == null) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(sim.px[body], sim.py[body], sim.pz[body]);
      group.scale.setScalar(sim.radius[body]);
      bodyColor(KIND_STAR, sim.hue[body], sim.heat[body], 0, tint);
      sun.uniforms.uColor.value.copy(tint);
      sun.uniforms.uTime.value = elapsed;
      sun.uniforms.uHeat.value = sim.heat[body];
      corona.uniforms.uColor.value.copy(tint);
      corona.uniforms.uTime.value = elapsed;
      corona.uniforms.uHeat.value = sim.heat[body];
    }

    for (let n = 0; n < HOLE_POOL; n++) {
      const group = holeGroups.current[n];
      const body = sim.holeSlots[n];
      const disk = diskMaterials[n];
      const jet = jetMaterials[n];
      if (!group) continue;
      if (body == null) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(sim.px[body], sim.py[body], sim.pz[body]);
      group.scale.setScalar(sim.radius[body]);
      group.rotation.y = sim.spin[body];
      group.rotation.z = 0.22;
      disk.uniforms.uTime.value = elapsed;
      disk.uniforms.uHeat.value = sim.heat[body];
      jet.uniforms.uTime.value = elapsed;
    }

    for (let n = 0; n < PULSAR_POOL; n++) {
      const group = pulsarGroups.current[n];
      const body = sim.pulsarSlots[n];
      const core = pulsarMaterials[n];
      const jet = jetMaterials[HOLE_POOL + n];
      if (!group) continue;
      if (body == null) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(sim.px[body], sim.py[body], sim.pz[body]);
      group.scale.setScalar(sim.radius[body]);
      group.rotation.y = sim.spin[body];
      group.rotation.x = 0.4;
      core.uniforms.uTime.value = elapsed;
      core.uniforms.uHeat.value = sim.heat[body];
      jet.uniforms.uTime.value = elapsed;
      jet.uniforms.uColor.value.set("#b7e4ff");
    }

    lightIds.fill(-1);
    lightScores.fill(-1);
    const considerLight = (id: number) => {
      const score = sim.mass[id] * (sim.kind[id] === KIND_STAR ? 1 : sim.kind[id] === KIND_PULSAR ? 0.7 : 0.42);
      for (let k = 0; k < LIGHT_POOL; k++) {
        if (score <= lightScores[k]) continue;
        for (let m = LIGHT_POOL - 1; m > k; m--) {
          lightScores[m] = lightScores[m - 1];
          lightIds[m] = lightIds[m - 1];
        }
        lightScores[k] = score;
        lightIds[k] = id;
        break;
      }
    };
    for (let n = 0; n < sim.starSlots.length; n++) considerLight(sim.starSlots[n]);
    for (let n = 0; n < sim.pulsarSlots.length; n++) considerLight(sim.pulsarSlots[n]);
    for (let n = 0; n < sim.holeSlots.length; n++) considerLight(sim.holeSlots[n]);
    for (let n = 0; n < LIGHT_POOL; n++) {
      const light = lights.current[n];
      const body = lightIds[n];
      if (!light) continue;
      if (body < 0) {
        light.intensity = 0;
        continue;
      }
      light.position.set(sim.px[body], sim.py[body], sim.pz[body]);
      bodyColor(sim.kind[body], sim.hue[body], sim.heat[body], 0, tint);
      light.color.copy(tint);
      light.distance = sim.radius[body] * (sim.kind[body] === KIND_STAR ? 110 : 70);
      light.intensity = Math.min(sim.kind[body] === KIND_STAR ? sim.mass[body] * 12 : sim.mass[body] * 5, 110000);
    }
    const lightPos = [planetUniforms.uLightA.value, planetUniforms.uLightB.value, planetUniforms.uLightC.value];
    for (let n = 0; n < 3; n++) {
      const body = lightIds[n];
      if (body >= 0) lightPos[n].set(sim.px[body], sim.py[body], sim.pz[body]);
    }

    for (let n = 0; n < sim.bursts.length; n++) {
      const flash = flashes.current[n];
      const shock = shocks.current[n];
      const burst = sim.bursts[n];
      const shockMat = shockMaterials[n];
      if (flash) {
        flash.visible = burst.active && burst.kind !== 1;
        if (flash.visible) {
          const t = burst.age / burst.life;
          flash.position.set(burst.x, burst.y, burst.z);
          flash.scale.setScalar(burst.scale * (0.28 + t * 4.2));
          const material = flash.material as THREE.MeshBasicMaterial;
          material.opacity = (1 - t) * 0.88;
          material.color.set(burst.kind === 2 ? "#ffb08a" : "#ffe7c2");
        }
      }
      if (shock && shockMat) {
        shock.visible = burst.active && burst.kind !== 2;
        if (shock.visible) {
          const t = burst.age / burst.life;
          shock.position.set(burst.x, burst.y, burst.z);
          shock.scale.setScalar(burst.scale * (0.8 + t * 7.5));
          shockMat.uniforms.uAge.value = t;
          shockMat.uniforms.uColor.value.set(burst.kind === 1 ? "#9ecbff" : "#ffe6b8");
        }
      }
    }

    const trailMesh = trail.current;
    if (trailMesh) {
      let written = 0;
      for (let i = 0; i < MAX_BODIES; i++) {
        if (sim.kind[i] !== KIND_COMET) continue;
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const src = (i * TRAIL_LENGTH + t) * 3;
          trailPositions[written] = sim.trails[src];
          trailPositions[written + 1] = sim.trails[src + 1];
          trailPositions[written + 2] = sim.trails[src + 2];
          written += 3;
        }
      }
      const attribute = trailMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      attribute.needsUpdate = true;
      trailMesh.geometry.setDrawRange(0, written / 3);
    }

    const debrisMesh = debris.current;
    if (debrisMesh) {
      let written = 0;
      for (let i = 0; i < DEBRIS_MAX; i++) {
        if (sim.debrisLife[i] <= 0) continue;
        debrisPositions[written * 3] = sim.debrisPx[i];
        debrisPositions[written * 3 + 1] = sim.debrisPy[i];
        debrisPositions[written * 3 + 2] = sim.debrisPz[i];
        tint.setHSL(sim.debrisHue[i], 0.7, 0.62);
        debrisColors[written * 3] = tint.r;
        debrisColors[written * 3 + 1] = tint.g;
        debrisColors[written * 3 + 2] = tint.b;
        debrisLife[written] = Math.min(1, sim.debrisLife[i] / 2.2);
        written += 1;
      }
      (debrisMesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (debrisMesh.geometry.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
      (debrisMesh.geometry.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;
      debrisMesh.geometry.setDrawRange(0, written);
    }

    const controls = state.controls as unknown as OrbitControlsLike | undefined;
    const follow = sim.followId;
    if (follow >= 0 && sim.kind[follow] !== 0 && controls) {
      const k = 1 - Math.exp(-delta * 3.4);
      const dx = sim.px[follow] - controls.target.x;
      const dy = sim.py[follow] - controls.target.y;
      const dz = sim.pz[follow] - controls.target.z;
      controls.target.x += dx * k;
      controls.target.y += dy * k;
      controls.target.z += dz * k;
      camera.position.x += dx * k;
      camera.position.y += dy * k;
      camera.position.z += dz * k;
    }
    if (sim.shake > 4) {
      const s = sim.shake * 0.12;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s * 0.6;
      camera.position.z += (Math.random() - 0.5) * s;
    }
  }, 8);

  return (
    <group>
      <ambientLight intensity={0.055} color="#6f86c8" />
      <hemisphereLight args={["#1a2c58", "#05070f", 0.28]} />

      {NEBULAS.map((nebula, i) => (
        <mesh key={`nebula-${nebula.color}`} position={[...nebula.position]} scale={nebula.scale}>
          <sphereGeometry args={[1, 24, 16]} />
          <shaderMaterial
            vertexShader={nebulaVertexShader}
            fragmentShader={nebulaFragmentShader}
            uniforms={nebulaUniforms[i]}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>
      ))}

      <points frustumCulled={false} geometry={diskGeometry}>
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={starUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points frustumCulled={false} geometry={haloGeometry}>
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={starUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points frustumCulled={false} geometry={lifeGeometry}>
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={starUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={trail} frustumCulled={false} geometry={trailGeometry}>
        <pointsMaterial color="#9be7ff" size={26} sizeAttenuation transparent opacity={0.58} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <points ref={debris} frustumCulled={false} geometry={debrisGeometry}>
        <shaderMaterial
          vertexShader={debrisVertexShader}
          fragmentShader={debrisFragmentShader}
          uniforms={debrisUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <instancedMesh
        ref={worlds}
        args={[planetGeometry, undefined, MAX_BODIES]}
        castShadow={false}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          const body = event.instanceId == null ? -1 : sim.instanceToBody[event.instanceId];
          if (body >= 0) beginDrag(body, event.clientX, event.clientY);
        }}
      >
        <shaderMaterial
          vertexShader={planetVertexShader}
          fragmentShader={planetFragmentShader}
          uniforms={planetUniforms}
        />
      </instancedMesh>
      <instancedMesh ref={atmospheres} args={[atmoGeometry, undefined, MAX_BODIES]} frustumCulled={false}>
        <shaderMaterial
          vertexShader={planetVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={planetUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </instancedMesh>
      <instancedMesh ref={rings} args={[ringGeometry, undefined, MAX_BODIES]} frustumCulled={false}>
        <shaderMaterial
          vertexShader={ringVertexShader}
          fragmentShader={ringFragmentShader}
          uniforms={ringUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {Array.from({ length: STAR_POOL }, (_, i) => (
        <group
          key={`star-${i}`}
          ref={(node) => {
            starGroups.current[i] = node;
          }}
          visible={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            const body = sim.starSlots[i];
            if (body != null) beginDrag(body, event.nativeEvent.clientX, event.nativeEvent.clientY);
          }}
        >
          <mesh material={sunMaterials[i]}>
            <sphereGeometry args={[1, 48, 32]} />
          </mesh>
          <mesh material={coronaMaterials[i]} scale={1.55}>
            <sphereGeometry args={[1, 28, 20]} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: HOLE_POOL }, (_, i) => (
        <group
          key={`hole-${i}`}
          ref={(node) => {
            holeGroups.current[i] = node;
          }}
          visible={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            const body = sim.holeSlots[i];
            if (body != null) beginDrag(body, event.nativeEvent.clientX, event.nativeEvent.clientY);
          }}
        >
          <mesh>
            <sphereGeometry args={[1, 32, 24]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
          <mesh material={lensMaterials[i]} scale={2.35}>
            <sphereGeometry args={[1, 32, 24]} />
          </mesh>
          <mesh material={diskMaterials[i]} rotation={[Math.PI / 2.5, 0, 0]} scale={[5.4, 5.4, 0.16]}>
            <circleGeometry args={[1, 72]} />
          </mesh>
          <mesh material={jetMaterials[i]} position={[0, 4.8, 0]}>
            <cylinderGeometry args={[0.12, 0.55, 9.5, 10, 1, true]} />
          </mesh>
          <mesh material={jetMaterials[i]} position={[0, -4.8, 0]} rotation={[Math.PI, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.55, 9.5, 10, 1, true]} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: PULSAR_POOL }, (_, i) => (
        <group
          key={`pulsar-${i}`}
          ref={(node) => {
            pulsarGroups.current[i] = node;
          }}
          visible={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            const body = sim.pulsarSlots[i];
            if (body != null) beginDrag(body, event.nativeEvent.clientX, event.nativeEvent.clientY);
          }}
        >
          <mesh material={pulsarMaterials[i]}>
            <sphereGeometry args={[1, 28, 20]} />
          </mesh>
          <mesh material={jetMaterials[HOLE_POOL + i]} position={[0, 6.2, 0]}>
            <cylinderGeometry args={[0.08, 0.42, 12, 8, 1, true]} />
          </mesh>
          <mesh material={jetMaterials[HOLE_POOL + i]} position={[0, -6.2, 0]} rotation={[Math.PI, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.42, 12, 8, 1, true]} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: LIGHT_POOL }, (_, i) => (
        <pointLight
          key={`light-${i}`}
          ref={(node) => {
            lights.current[i] = node;
          }}
          decay={1.65}
          distance={90000}
          intensity={0}
        />
      ))}

      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={`flash-${i}`}
          ref={(node) => {
            flashes.current[i] = node;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 22, 16]} />
          <meshBasicMaterial color="#ffe7c2" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={`shock-${i}`}
          ref={(node) => {
            shocks.current[i] = node;
          }}
          material={shockMaterials[i]}
          visible={false}
        >
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
      ))}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
          pointerDownAt.current = performance.now();
        }}
        onPointerUp={(event) => {
          finishPointer(event.point, event.nativeEvent, event.shiftKey);
        }}
      >
        <planeGeometry args={[8000000, 8000000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
