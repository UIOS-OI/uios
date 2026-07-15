"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const MYCELIUM_VS = `
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveScale;
  uniform float uAmplitude;
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    vec3 pos = position;
    
    // Multi-frequency organic waving
    float speed = uTime * uWaveSpeed;
    float waveX = sin(pos.y * uWaveScale + speed) * cos(pos.z * uWaveScale * 0.85 + speed * 0.73) * uAmplitude;
    float waveY = cos(pos.x * uWaveScale * 1.12 + speed * 0.88) * sin(pos.z * uWaveScale * 0.94 + speed * 1.15) * uAmplitude * 0.85;
    float waveZ = sin(pos.x * uWaveScale * 0.82 + speed * 1.05) * cos(pos.y * uWaveScale * 1.18 + speed * 0.78) * uAmplitude;
    
    pos.x += waveX;
    pos.y += waveY;
    pos.z += waveZ;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const MYCELIUM_FS = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vPosition;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;

  constructor() {}

  public init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 1.2);

    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.32, this.ctx.currentTime);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.35, this.ctx.currentTime);
    
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.masterGain);

    this.startDrone();
  }

  private startDrone() {
    if (!this.ctx || !this.masterGain) return;
    
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    
    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = "sine";
    this.osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1
    
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = "triangle";
    this.osc2.frequency.setValueAtTime(110, this.ctx.currentTime); // A2
    
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.setValueAtTime(160, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(2.5, this.ctx.currentTime);

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.setValueAtTime(0.05, this.ctx.currentTime);
    
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.setValueAtTime(70, this.ctx.currentTime);

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);

    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.osc1.start();
    this.osc2.start();
    this.lfo.start();
  }

  public triggerChime(nodeIndex: number) {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    
    // Pentatonic scale (beautiful celestial tones)
    const scale = [220.00, 246.94, 277.18, 329.63, 392.00, 440.00, 493.88, 554.37, 659.25, 783.99, 880.00];
    const baseFreq = scale[nodeIndex % scale.length];

    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(baseFreq, now);

    const modulator = this.ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(baseFreq * 1.5, now);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(baseFreq * 2.2, now);
    modGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const ampGain = this.ctx.createGain();
    ampGain.gain.setValueAtTime(0.0, now);
    ampGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    ampGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    carrier.connect(ampGain);
    ampGain.connect(this.masterGain);
    if (this.delayNode) {
      ampGain.connect(this.delayNode);
    }

    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + 2.5);
    modulator.stop(now + 2.5);
  }

  public triggerPulse() {
    if (!this.ctx || !this.masterGain || Math.random() > 0.12) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800 + Math.random() * 800, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.004, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public setMute(muted: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const targetVal = muted ? 0.0 : 0.5;
    this.masterGain.gain.linearRampToValueAtTime(targetVal, this.ctx.currentTime + 0.3);
  }

  public close() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

const uiosAudio = new ProceduralAudioEngine();

function getIntroFlicker(time: number) {
  if (time < 1.2) return 0;
  if (time < 3.5) {
    const pulse = Math.sin(time * 78) * Math.cos(time * 45);
    return pulse > 0.72 ? 0.25 : 0;
  }
  if (time < 5.8) {
    const surge = Math.sin(time * 24) * Math.cos(time * 12);
    if (surge > 0.2) {
      return 0.4 + Math.sin(time * 80) * 0.15;
    }
    return 0.05 * Math.sin(time * 40);
  }
  if (time < 7.8) {
    return 0.75 + Math.sin(time * 95) * 0.12;
  }
  return 1.0;
}

type NodeId = "core" | "router" | "aegis" | "memory" | "openai" | "anthropic" | "gemini" | "mistral";
type UniverseNode = {
  id: NodeId;
  title: string;
  shortTitle: string;
  category: string;
  description: string;
  color: string;
  position: readonly [number, number, number];
  radius: number;
  kind: "core" | "zone" | "provider";
};

const NODES: readonly UniverseNode[] = [
  { id: "core", title: "Intelligence Core", shortTitle: "UIOS CORE", category: "SYSTEM SUN", description: "The living center of the intelligence universe. Every route, memory, and policy boundary converges here.", color: "#ffc52f", position: [0, 0, 0], radius: 2.25, kind: "core" },
  { id: "router", title: "Universal Router", shortTitle: "ROUTER", category: "ROUTER ZONE", description: "Intent moves through this zone toward the right model, agent, tool, or workflow.", color: "#3c9dff", position: [0, 10, -13], radius: .62, kind: "zone" },
  { id: "aegis", title: "Aegis Security", shortTitle: "AEGIS", category: "SECURITY ZONE", description: "The policy boundary surrounding every intelligence path, approval, and protected action.", color: "#25c8ff", position: [-13, -3.6, -9], radius: .66, kind: "zone" },
  { id: "memory", title: "Shared Memory", shortTitle: "MEMORY", category: "MEMORY ZONE", description: "A connected context field that keeps intelligence coherent across models, agents, and workflows.", color: "#a855f7", position: [13.5, -3.1, -10], radius: .66, kind: "zone" },
  { id: "openai", title: "OpenAI", shortTitle: "OPENAI", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#38bdf8", position: [-8.6, 3.5, 1.2], radius: .31, kind: "provider" },
  { id: "anthropic", title: "Anthropic", shortTitle: "ANTHROPIC", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#8b5cf6", position: [8.9, 4, .4], radius: .31, kind: "provider" },
  { id: "gemini", title: "Google Gemini", shortTitle: "GEMINI", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#60a5fa", position: [-6.4, -7.6, -2.2], radius: .31, kind: "provider" },
  { id: "mistral", title: "Mistral AI", shortTitle: "MISTRAL", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#c084fc", position: [7.2, -7, -3.4], radius: .31, kind: "provider" },
];

const INTRO_SPARKS = [
  [10, 18, 0], [23, 72, .34], [35, 28, .72], [46, 82, .18], [58, 16, .92], [71, 68, .48], [84, 31, 1.1], [91, 78, .62],
  [16, 48, 1.28], [29, 9, .56], [41, 58, 1.44], [55, 38, .82], [66, 88, .24], [77, 47, 1.36], [88, 12, .4], [5, 86, 1.02],
] as const;

const NODE_MAP = new Map(NODES.map((node) => [node.id, node]));
const CONNECTIONS: readonly [NodeId, NodeId][] = [
  ["core", "router"], ["core", "aegis"], ["core", "memory"],
  ["core", "openai"], ["core", "anthropic"], ["core", "gemini"], ["core", "mistral"],
  ["router", "openai"], ["router", "anthropic"], ["router", "gemini"], ["router", "mistral"],
  ["aegis", "router"], ["memory", "router"],
];

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function SpriteLabel({ text, color, y, prominent = false }: { text: string; color: string; y: number; prominent?: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const left = 38;
    const top = 24;
    const width = canvas.width - left * 2;
    const height = canvas.height - top * 2;
    const radius = 34;
    context.beginPath();
    context.moveTo(left + radius, top);
    context.lineTo(left + width - radius, top);
    context.quadraticCurveTo(left + width, top, left + width, top + radius);
    context.lineTo(left + width, top + height - radius);
    context.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
    context.lineTo(left + radius, top + height);
    context.quadraticCurveTo(left, top + height, left, top + height - radius);
    context.lineTo(left, top + radius);
    context.quadraticCurveTo(left, top, left + radius, top);
    context.closePath();
    context.fillStyle = "rgba(2, 7, 22, .88)";
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = prominent ? 4 : 3;
    context.globalAlpha = .88;
    context.stroke();
    context.globalAlpha = 1;
    context.font = `${prominent ? 700 : 650} ${prominent ? 42 : 36}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.letterSpacing = prominent ? "7px" : "6px";
    context.shadowColor = color;
    context.shadowBlur = 24;
    context.fillStyle = "#f4f6ff";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    setTexture(nextTexture);
    return () => nextTexture.dispose();
  }, [color, prominent, text]);

  if (!texture) return null;
  return <sprite position={[0, y, 0]} scale={prominent ? [3.6, .75, 1] : [3, .63, 1]}>
    <spriteMaterial map={texture} transparent depthWrite={false} opacity={.97} />
  </sprite>;
}

function StarField({ reducedMotion }: { reducedMotion: boolean }) {
  const bgRef = useRef<THREE.Points>(null);
  const midRef = useRef<THREE.Points>(null);
  const sporeRef = useRef<THREE.Points>(null);

  const bgPositions = useMemo(() => {
    const random = seededRandom(0x1111);
    const points = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const radius = 35 + random() * 45;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
      points[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return points;
  }, []);

  const midPositions = useMemo(() => {
    const random = seededRandom(0x2222);
    const points = new Float32Array(1000 * 3);
    for (let i = 0; i < 1000; i++) {
      const radius = 15 + random() * 25;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[i * 3 + 1] = radius * Math.cos(phi) * 0.7;
      points[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return points;
  }, []);

  const [sporePositions, sporePhases] = useMemo(() => {
    const random = seededRandom(0x3333);
    const points = new Float32Array(150 * 3);
    const phases = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      const radius = 2 + random() * 18;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[i * 3 + 1] = radius * Math.cos(phi) * 0.8;
      points[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      phases[i * 3] = random() * Math.PI * 2;
      phases[i * 3 + 1] = random() * Math.PI * 2;
      phases[i * 3 + 2] = random() * Math.PI * 2;
    }
    return [points, phases];
  }, []);

  const bgMat = useRef<THREE.PointsMaterial>(null);
  const midMat = useRef<THREE.PointsMaterial>(null);
  const sporeMat = useRef<THREE.PointsMaterial>(null);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime();
    const flicker = getIntroFlicker(elapsed);
    if (bgMat.current) bgMat.current.opacity = 0.5 * flicker;
    if (midMat.current) midMat.current.opacity = 0.68 * flicker;
    if (sporeMat.current) sporeMat.current.opacity = 0.75 * flicker;
    if (reducedMotion) return;
    if (bgRef.current) bgRef.current.rotation.y += delta * 0.001;
    if (midRef.current) midRef.current.rotation.y -= delta * 0.0022;
    if (sporeRef.current) {
      sporeRef.current.rotation.y += delta * 0.008;
      const positions = sporeRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < 150; i++) {
        positions[i * 3] += Math.sin(elapsed * 0.4 + sporePhases[i * 3]) * 0.004;
        positions[i * 3 + 1] += Math.cos(elapsed * 0.3 + sporePhases[i * 3 + 1]) * 0.003;
        positions[i * 3 + 2] += Math.sin(elapsed * 0.5 + sporePhases[i * 3 + 2]) * 0.004;
      }
      sporeRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      <points ref={bgRef} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[bgPositions, 3]} /></bufferGeometry>
        <pointsMaterial ref={bgMat} color="#4f5699" size={0.038} sizeAttenuation transparent opacity={0.5} depthWrite={false} />
      </points>

      <points ref={midRef} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[midPositions, 3]} /></bufferGeometry>
        <pointsMaterial ref={midMat} color="#8fa6ff" size={0.065} sizeAttenuation transparent opacity={0.68} depthWrite={false} />
      </points>

      <points ref={sporeRef} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[sporePositions, 3]} /></bufferGeometry>
        <pointsMaterial ref={sporeMat} color="#b4eaff" size={0.28} sizeAttenuation transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

function GalaxyField({ node, active, reducedMotion }: { node: UniverseNode; active: boolean; reducedMotion: boolean }) {
  const galaxy = useRef<THREE.Group>(null);
  const positions = useMemo(() => {
    const seed = 0x94f11 + NODES.findIndex((item) => item.id === node.id) * 741;
    const random = seededRandom(seed);
    const count = node.kind === "zone" ? 230 : 130;
    const spread = node.kind === "zone" ? 2.7 : 1.35;
    const points = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = .16 + Math.pow(random(), .58) * spread;
      const arm = index % 3 * Math.PI * 2 / 3;
      const theta = arm + radius * 1.42 + (random() - .5) * .48;
      points[index * 3] = Math.cos(theta) * radius;
      points[index * 3 + 1] = (random() - .5) * (.12 + radius * .045);
      points[index * 3 + 2] = Math.sin(theta) * radius;
    }
    return points;
  }, [node.id, node.kind]);

  useFrame(({ clock }, delta) => {
    if (!galaxy.current || reducedMotion) return;
    galaxy.current.rotation.y += delta * (node.kind === "zone" ? .07 : .11);
    galaxy.current.rotation.z = Math.sin(clock.elapsedTime * .11 + node.position[0]) * .06;
  });

  const spread = node.kind === "zone" ? 2.7 : 1.35;
  return <group ref={galaxy} rotation={[.42, 0, node.position[0] * .025]}>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={node.color} size={node.kind === "zone" ? .055 : .04} sizeAttenuation transparent opacity={active ? .95 : .68} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[spread * .42, spread, 96]} />
      <meshBasicMaterial color={node.color} transparent opacity={active ? .055 : .025} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[spread * .74, .012, 5, 96]} />
      <meshBasicMaterial color="#eaf8ff" transparent opacity={.22} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  </group>;
}

function CoreNode({ active, reducedMotion, onSelect }: { active: boolean; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  const shell = useRef<THREE.Group>(null);
  const fire = useRef<THREE.Group>(null);
  const fireOpposite = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const innerMeshRef = useRef<THREE.Mesh>(null);
  const fireMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const fireOppMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const coronaMatRef = useRef<THREE.PointsMaterial>(null);
  const ring1MatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ring2MatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ring3MatRef = useRef<THREE.MeshBasicMaterial>(null);

  const [hovered, setHovered] = useState(false);
  const node = NODE_MAP.get("core")!;

  const corona = useMemo(() => {
    const random = seededRandom(0x94f11);
    const radius = 2.45;
    const points = new Float32Array(340 * 3);
    for (let index = 0; index < 340; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[index * 3 + 1] = radius * Math.cos(phi);
      points[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return points;
  }, []);

  const mouse3D = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const flicker = getIntroFlicker(time);

    // Calculate mouse intersection in 3D (camera perpendicular plane)
    state.camera.getWorldDirection(normal);
    normal.negate();
    const plane = new THREE.Plane(normal, 0);
    state.raycaster.ray.intersectPlane(plane, mouse3D);

    const nodePos = new THREE.Vector3(...node.position);
    const dist = nodePos.distanceTo(mouse3D);
    const influence = dist < 7.0 ? Math.max(0, 1 - dist / 7.0) : 0;

    if (lightRef.current) lightRef.current.intensity = (active ? 34 : 25) * flicker + influence * 15;
    if (matRef.current) matRef.current.emissiveIntensity = (active ? 3.5 : 2.8) * flicker + influence * 2.2;
    if (innerMeshRef.current) innerMeshRef.current.scale.setScalar(flicker + influence * 0.15);
    if (fireMatRef.current) fireMatRef.current.opacity = 0.45 * flicker;
    if (fireOppMatRef.current) fireOppMatRef.current.opacity = 0.26 * flicker;
    if (coronaMatRef.current) coronaMatRef.current.opacity = 0.88 * flicker;
    if (ring1MatRef.current) ring1MatRef.current.opacity = 0.46 * flicker;
    if (ring2MatRef.current) ring2MatRef.current.opacity = 0.25 * flicker;
    if (ring3MatRef.current) ring3MatRef.current.opacity = 0.18 * flicker;

    if (shell.current) {
      shell.current.rotation.y += reducedMotion ? 0 : delta * .09;
      shell.current.rotation.x = Math.sin(time * .2) * .08;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.5) * .04;
      shell.current.scale.setScalar(pulse * (hovered ? 1.08 : 1));

      // Displace position toward cursor (bending network)
      const displacement = new THREE.Vector3().subVectors(mouse3D, nodePos).normalize().multiplyScalar(influence * 0.95);
      shell.current.position.copy(displacement);
    }
    if (fire.current && !reducedMotion) {
      fire.current.rotation.y -= delta * .15;
      fire.current.rotation.z += delta * .04;
    }
    if (fireOpposite.current && !reducedMotion) {
      fireOpposite.current.rotation.y += delta * .12;
      fireOpposite.current.rotation.x -= delta * .04;
    }
    if (rings.current && !reducedMotion) {
      rings.current.rotation.z -= delta * .06;
      rings.current.rotation.y += delta * .03;
    }
  });

  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect("core"); };
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    window.location.href = "/platform";
  };

  return <group position={node.position}>
    <group ref={shell} onClick={select} onDoubleClick={handleDoubleClick} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerLeave={() => { setHovered(false); document.body.style.cursor = ""; }}>
      <pointLight ref={lightRef} color="#ffb21c" intensity={active ? 34 : 25} distance={35} decay={1.5} />
      
      {/* Inner Core Dodecahedron */}
      <mesh ref={innerMeshRef}><dodecahedronGeometry args={[1.4, 0]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      
      {/* Refractive Middle Glass Gem */}
      <mesh><icosahedronGeometry args={[2.25, 1]} /><meshPhysicalMaterial ref={matRef} color="#ff9d00" emissive="#ffb000" emissiveIntensity={active ? 3.5 : 2.8} roughness={0.12} metalness={0.15} transmission={0.7} thickness={1.5} flatShading={true} toneMapped={false} /></mesh>
      
      {/* Outer Gyroscope */}
      <group ref={fire}>
        <mesh><icosahedronGeometry args={[2.43, 3]} /><meshBasicMaterial ref={fireMatRef} color="#ffd84a" wireframe transparent opacity={.45} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
        <points>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[corona, 3]} /></bufferGeometry>
          <pointsMaterial ref={coronaMatRef} color="#ffcf40" size={.11} sizeAttenuation transparent opacity={.88} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </points>
      </group>
      <group ref={fireOpposite}>
        <mesh><icosahedronGeometry args={[2.62, 2]} /><meshBasicMaterial ref={fireOppMatRef} color="#ff5b0a" wireframe transparent opacity={.26} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      </group>
    </group>
    
    <group ref={rings}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[3.05, .018, 6, 120]} /><meshBasicMaterial ref={ring1MatRef} color="#ffd84a" transparent opacity={.46} blending={THREE.AdditiveBlending} /></mesh>
      <mesh rotation={[1.15, .3, .5]}><torusGeometry args={[3.72, .012, 6, 120]} /><meshBasicMaterial ref={ring2MatRef} color="#ff6b12" transparent opacity={.25} blending={THREE.AdditiveBlending} /></mesh>
      <mesh rotation={[0.4, 1.2, 0.2]}><torusGeometry args={[4.2, .008, 4, 96]} /><meshBasicMaterial ref={ring3MatRef} color="#ffc52f" transparent opacity={.18} blending={THREE.AdditiveBlending} /></mesh>
    </group>
    <SpriteLabel text={node.shortTitle} color={node.color} y={-3.45} prominent />
  </group>;
}

function ZoneDetails({ id, color, active, reducedMotion }: { id: NodeId; color: string; active: boolean; reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += 0.012;
      groupRef.current.rotation.z += 0.006;
    }
  });

  if (id === "memory") {
    return (
      <group ref={groupRef}>
        <mesh position={[1.4, 0.4, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
        <mesh position={[-1.0, -0.6, 1.0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshBasicMaterial color="#d9f7ff" transparent opacity={0.7} />
        </mesh>
        <mesh position={[0.2, -1.2, -1.2]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} />
        </mesh>
      </group>
    );
  }

  if (id === "aegis") {
    return (
      <group ref={groupRef} rotation={[Math.PI / 3, 0, 0]}>
        <mesh>
          <ringGeometry args={[1.3, 1.4, 32]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.4} />
        </mesh>
        <mesh scale={1.1} rotation={[0, 0, Math.PI / 4]}>
          <ringGeometry args={[1.4, 1.43, 4]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.6} />
        </mesh>
      </group>
    );
  }

  if (id === "router") {
    return (
      <group ref={groupRef}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 3.5, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 3.5, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    );
  }

  return null;
}

function IntelligenceNode({ node, active, reducedMotion, onSelect }: { node: UniverseNode; active: boolean; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  const ref = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const outerMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const detailsRef = useRef<THREE.Group>(null);

  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => NODES.findIndex((item) => item.id === node.id) * .73, [node.id]);

  const mouse3D = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const time = state.clock.elapsedTime;
    const flicker = getIntroFlicker(time);

    // Calculate mouse intersection in 3D (camera perpendicular plane)
    state.camera.getWorldDirection(normal);
    normal.negate();
    const plane = new THREE.Plane(normal, 0);
    state.raycaster.ray.intersectPlane(plane, mouse3D);

    const nodePos = new THREE.Vector3(...node.position);
    const dist = nodePos.distanceTo(mouse3D);
    const influence = dist < 6.0 ? Math.max(0, 1 - dist / 6.0) : 0;

    if (lightRef.current) lightRef.current.intensity = (active ? 5.5 : 2.6) * flicker + influence * 3.5;
    if (matRef.current) matRef.current.emissiveIntensity = (active ? 2.4 : hovered ? 1.9 : 1.35) * flicker + influence * 1.6;
    if (outerMatRef.current) outerMatRef.current.opacity = (active ? .95 : .55) * flicker + influence * 0.25;
    if (detailsRef.current) detailsRef.current.scale.setScalar(flicker + influence * 0.12);

    if (!reducedMotion) ref.current.rotation.y += delta * (node.kind === "zone" ? .12 : .18);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.5 + phase) * .055;
    ref.current.scale.setScalar(pulse * (hovered || active ? 1.14 : 1));

    // Displace position toward cursor (bending network)
    const displacement = new THREE.Vector3().subVectors(mouse3D, nodePos).normalize().multiplyScalar(influence * 0.65);
    ref.current.position.copy(displacement);
  });

  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(node.id); };
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const destinations: Record<NodeId, string> = {
      core: "/platform",
      router: "/platform",
      aegis: "/security",
      memory: "/platform",
      openai: "/products",
      anthropic: "/products",
      gemini: "/products",
      mistral: "/products",
    };
    const url = destinations[node.id];
    if (url) {
      window.location.href = url;
    }
  };

  return <group position={node.position}>
    <GalaxyField node={node} active={active} reducedMotion={reducedMotion} />
    <group ref={ref} onClick={select} onDoubleClick={handleDoubleClick} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerLeave={() => { setHovered(false); document.body.style.cursor = ""; }}>
      <pointLight ref={lightRef} color={node.color} intensity={active ? 5.5 : 2.6} distance={node.kind === "zone" ? 8 : 4.5} />
      <mesh>
        <sphereGeometry args={[node.radius, 28, 28]} />
        <meshPhysicalMaterial ref={matRef} color="#f4f8ff" emissive={node.color} emissiveIntensity={active ? 2.4 : hovered ? 1.9 : 1.35} roughness={.26} metalness={.15} transparent opacity={.94} />
      </mesh>
      <mesh scale={1.3}><icosahedronGeometry args={[node.radius, 1]} /><meshBasicMaterial ref={outerMatRef} color="#eaf8ff" wireframe transparent opacity={active ? .95 : .55} blending={THREE.AdditiveBlending} /></mesh>
      
      <group ref={detailsRef}>
        <ZoneDetails id={node.id} color={node.color} active={active} reducedMotion={reducedMotion} />
      </group>
    </group>
    <SpriteLabel text={node.shortTitle} color={node.color} y={node.kind === "zone" ? -1.42 : -.86} prominent={node.kind === "zone"} />
  </group>;
}

function WorldSatellite({ position, color, index, reducedMotion }: { position: THREE.Vector3; color: string; index: number; reducedMotion: boolean }) {
  const satellite = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!satellite.current) return;
    const pulse = reducedMotion ? 1 : .82 + Math.sin(clock.elapsedTime * (.72 + index * .031) + index * 1.37) * .22;
    satellite.current.scale.setScalar(pulse);
  });
  return <mesh ref={satellite} position={position}>
    <sphereGeometry args={[.105 + index % 3 * .018, 10, 10]} />
    <meshBasicMaterial color={index % 2 ? color : "#d9f7ff"} toneMapped={false} />
  </mesh>;
}

function LocalNodeWorld({ node, reducedMotion }: { node: UniverseNode; reducedMotion: boolean }) {
  const world = useRef<THREE.Group>(null);
  const material = useRef<THREE.LineBasicMaterial>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  const data = useMemo(() => {
    const random = seededRandom(0x7a11c + NODES.findIndex((item) => item.id === node.id) * 1307);
    const satellites = Array.from({ length: 11 }, (_, index) => {
      const angle = index / 11 * Math.PI * 2 + (random() - .5) * .42;
      const radius = 1.45 + random() * 1.55;
      return new THREE.Vector3(Math.cos(angle) * radius, (random() - .5) * 1.9, Math.sin(angle) * radius * .78);
    });
    const segments: number[] = [];
    const appendCurve = (curve: THREE.CatmullRomCurve3, steps: number) => {
      let previous = curve.getPoint(0);
      for (let step = 1; step <= steps; step += 1) {
        const point = curve.getPoint(step / steps);
        segments.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
        previous = point;
      }
    };
    const center = new THREE.Vector3();
    satellites.forEach((satellite, index) => {
      const bend = satellite.clone().multiplyScalar(.48).add(new THREE.Vector3((index % 2 ? -1 : 1) * .22, .18 * Math.sin(index), .24));
      appendCurve(new THREE.CatmullRomCurve3([center, bend, satellite], false, "centripetal"), 12);
      const next = satellites[(index + 1) % satellites.length];
      const bridge = satellite.clone().lerp(next, .5).multiplyScalar(1.13);
      appendCurve(new THREE.CatmullRomCurve3([satellite, bridge, next], false, "centripetal"), 8);
      if (index % 3 === 0) {
        const cross = satellites[(index + 4) % satellites.length];
        appendCurve(new THREE.CatmullRomCurve3([satellite, satellite.clone().lerp(cross, .5).add(new THREE.Vector3(0, .28, .18)), cross], false, "centripetal"), 9);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    return { geometry, satellites };
  }, [node.id]);

  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(({ clock }, delta) => {
    if (!world.current) return;
    const target = 1 + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * .42) * .025);
    targetScale.setScalar(target);
    world.current.scale.lerp(targetScale, Math.min(1, delta * 3.2));
    if (!reducedMotion) world.current.rotation.y += delta * .045;
    if (material.current) material.current.opacity = reducedMotion ? .52 : .42 + Math.sin(clock.elapsedTime * .63 + node.position[0]) * .14;
  });

  return <group ref={world} position={node.position} scale={.02}>
    <lineSegments geometry={data.geometry}>
      <lineBasicMaterial ref={material} color={node.color} transparent opacity={.48} blending={THREE.AdditiveBlending} toneMapped={false} />
    </lineSegments>
    {data.satellites.map((position, index) => <WorldSatellite key={`${node.id}-${index}`} position={position} color={node.color} index={index} reducedMotion={reducedMotion} />)}
  </group>;
}

function LivingNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  const blueLinesRef = useRef<THREE.ShaderMaterial>(null);
  const purpleLinesRef = useRef<THREE.ShaderMaterial>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  
  const web = useMemo(() => {
    const blueSegments: number[] = [];
    const purpleSegments: number[] = [];
    const curves: THREE.CatmullRomCurve3[] = [];
    CONNECTIONS.forEach(([fromId, toId], edgeIndex) => {
      const from = new THREE.Vector3(...NODE_MAP.get(fromId)!.position);
      const to = new THREE.Vector3(...NODE_MAP.get(toId)!.position);
      const direction = to.clone().sub(from);
      const side = new THREE.Vector3(-direction.y, direction.x, direction.z * .18).normalize();
      const lift = new THREE.Vector3(0, .35 + edgeIndex % 3 * .16, .45 * (edgeIndex % 2 ? 1 : -1));
      const controlOne = from.clone().lerp(to, .32).add(side.clone().multiplyScalar(.42 + edgeIndex % 4 * .08)).add(lift);
      const controlTwo = from.clone().lerp(to, .68).add(side.clone().multiplyScalar(-.38 - edgeIndex % 3 * .09)).sub(lift.clone().multiplyScalar(.45));
      const curve = new THREE.CatmullRomCurve3([from, controlOne, controlTwo, to], false, "centripetal");
      curves.push(curve);
      const target = edgeIndex % 2 === 0 ? blueSegments : purpleSegments;

      for (let filament = -1; filament <= 1; filament += 1) {
        let previous: THREE.Vector3 | null = null;
        for (let step = 0; step <= 18; step += 1) {
          const progress = step / 18;
          const point = curve.getPoint(progress);
          point.add(side.clone().multiplyScalar(filament * .1 * Math.sin(progress * Math.PI)));
          point.z += Math.sin(progress * Math.PI * 3 + filament) * .035;
          if (previous) target.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
          previous = point;
        }
      }

      for (const step of [4, 7, 10, 13, 16]) {
        const progress = step / 18;
        const center = curve.getPoint(progress);
        const spread = .1 * Math.sin(progress * Math.PI);
        const leftPoint = center.clone().add(side.clone().multiplyScalar(-spread));
        const rightPoint = center.clone().add(side.clone().multiplyScalar(spread));
        leftPoint.z += Math.sin(progress * Math.PI * 3 - 1) * .035;
        rightPoint.z += Math.sin(progress * Math.PI * 3 + 1) * .035;
        target.push(leftPoint.x, leftPoint.y, leftPoint.z, rightPoint.x, rightPoint.y, rightPoint.z);
      }

      for (const progress of [.3, .58, .78]) {
        const root = curve.getPoint(progress);
        const branchDirection = edgeIndex % 2 ? -1 : 1;
        const tip = root.clone().add(side.clone().multiplyScalar(branchDirection * (.34 + progress * .28))).add(new THREE.Vector3(0, .12 + progress * .1, .08));
        const mid = root.clone().lerp(tip, .58).add(new THREE.Vector3(0, .08, branchDirection * .06));
        const branch = new THREE.CatmullRomCurve3([root, mid, tip], false, "centripetal");
        let previous = branch.getPoint(0);
        for (let branchStep = 1; branchStep <= 8; branchStep += 1) {
          const point = branch.getPoint(branchStep / 8);
          target.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
          previous = point;
        }
      }
    });
    const makeGeometry = (segments: number[]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
      return geometry;
    };
    return { blueGeometry: makeGeometry(blueSegments), purpleGeometry: makeGeometry(purpleSegments), curves };
  }, []);

  const blueUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#38cfff") },
    uOpacity: { value: 0.38 },
    uWaveSpeed: { value: 0.7 },
    uWaveScale: { value: 0.12 },
    uAmplitude: { value: 0.35 },
  }), []);

  const purpleUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#b55cff") },
    uOpacity: { value: 0.35 },
    uWaveSpeed: { value: 0.6 },
    uWaveScale: { value: 0.14 },
    uAmplitude: { value: 0.3 },
  }), []);

  const pulseColors = useMemo(() => {
    const colors = new Float32Array(web.curves.length * 3 * 3);
    web.curves.forEach((_, edgeIndex) => {
      const color = new THREE.Color(edgeIndex % 2 === 0 ? "#39c6ff" : "#b866ff");
      for (let pulseIndex = 0; pulseIndex < 3; pulseIndex += 1) color.toArray(colors, (edgeIndex * 3 + pulseIndex) * 3);
    });
    return colors;
  }, [web.curves]);

  const pulseProfiles = useMemo(() => {
    const random = seededRandom(0x1e7c0);
    const profiles = new Float32Array(web.curves.length * 3 * 4);
    for (let index = 0; index < web.curves.length * 3; index += 1) {
      profiles[index * 4] = .026 + random() * .032;
      profiles[index * 4 + 1] = random();
      profiles[index * 4 + 2] = .72 + random() * .8;
      profiles[index * 4 + 3] = .72 + random() * .72;
    }
    return profiles;
  }, [web.curves.length]);

  useEffect(() => () => { web.blueGeometry.dispose(); web.purpleGeometry.dispose(); }, [web]);
  
  const mouse3D = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    const flicker = getIntroFlicker(elapsed);
    const blueEnergy = reducedMotion ? 0 : Math.sin(elapsed * .19) * .055 + Math.sin(elapsed * .071 + 2.1) * .035;
    const purpleEnergy = reducedMotion ? 0 : Math.sin(elapsed * .143 + 1.8) * .05 + Math.sin(elapsed * .053) * .04;
    
    // Calculate mouse intersection in 3D (camera perpendicular plane)
    state.camera.getWorldDirection(normal);
    normal.negate();
    const plane = new THREE.Plane(normal, 0);
    state.raycaster.ray.intersectPlane(plane, mouse3D);

    if (blueLinesRef.current) {
      blueLinesRef.current.uniforms.uTime.value = elapsed;
      blueLinesRef.current.uniforms.uOpacity.value = (0.38 + blueEnergy) * flicker;
    }
    if (purpleLinesRef.current) {
      purpleLinesRef.current.uniforms.uTime.value = elapsed;
      purpleLinesRef.current.uniforms.uOpacity.value = (0.35 + purpleEnergy) * flicker;
    }
    
    const pulseMesh = pulses.current;
    if (!pulseMesh) return;
    
    web.curves.forEach((curve, edgeIndex) => {
      for (let pulseIndex = 0; pulseIndex < 3; pulseIndex += 1) {
        const instanceIndex = edgeIndex * 3 + pulseIndex;
        const speed = pulseProfiles[instanceIndex * 4];
        const phase = pulseProfiles[instanceIndex * 4 + 1];
        const shimmer = pulseProfiles[instanceIndex * 4 + 2];
        const size = pulseProfiles[instanceIndex * 4 + 3];
        const progress = reducedMotion ? phase : (elapsed * speed + phase) % 1;
        const pulse = reducedMotion ? .7 : .18 + Math.pow(.5 + Math.sin(elapsed * shimmer + phase * Math.PI * 2) * .5, 3) * .82;
        position.copy(curve.getPointAt(progress));
        
        // Proximity scaling
        const dist = position.distanceTo(mouse3D);
        const influence = dist < 5.0 ? Math.max(0, 1 - dist / 5.0) : 0;
        
        scale.setScalar((.035 + Math.sin(progress * Math.PI) * .07) * size * pulse * flicker * (1.0 + influence * 2.8));
        matrix.compose(position, quaternion, scale);
        pulseMesh.setMatrixAt(instanceIndex, matrix);
      }
    });
    pulseMesh.instanceMatrix.needsUpdate = true;

    // Trigger subtle sound synth clicks periodically for moving data pulses
    if (!reducedMotion) {
      uiosAudio.triggerPulse();
    }
  });

  return <group>
    <lineSegments geometry={web.blueGeometry}>
      <shaderMaterial 
        ref={blueLinesRef}
        vertexShader={MYCELIUM_VS}
        fragmentShader={MYCELIUM_FS}
        uniforms={blueUniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
    <lineSegments geometry={web.purpleGeometry}>
      <shaderMaterial 
        ref={purpleLinesRef}
        vertexShader={MYCELIUM_VS}
        fragmentShader={MYCELIUM_FS}
        uniforms={purpleUniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
    <instancedMesh ref={pulses} args={[undefined, undefined, web.curves.length * 3]} frustumCulled={false}>
      <sphereGeometry args={[1, 7, 7]}><instancedBufferAttribute attach="attributes-instanceColor" args={[pulseColors, 3]} /></sphereGeometry>
      <meshBasicMaterial vertexColors transparent opacity={.95} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function CameraRig({ selected, focusVersion, scrollY, reducedMotion }: { selected: NodeId; focusVersion: number; scrollY: number; reducedMotion: boolean }) {
  const { camera, gl } = useThree();
  const controls = useRef<ThreeOrbitControls | null>(null);
  const transition = useRef({ 
    active: false, 
    startedAt: 0, 
    duration: 1, 
    fromPosition: new THREE.Vector3(), 
    fromTarget: new THREE.Vector3(), 
    toPosition: new THREE.Vector3(), 
    toTarget: new THREE.Vector3(),
    midPosition: new THREE.Vector3() 
  });

  useEffect(() => {
    const nextControls = new ThreeOrbitControls(camera, gl.domElement);
    nextControls.enableDamping = true;
    nextControls.dampingFactor = .055;
    nextControls.enablePan = true;
    nextControls.minDistance = 3.2;
    nextControls.maxDistance = 64; // Increased max distance for galaxy zoom out
    nextControls.minPolarAngle = .16;
    nextControls.maxPolarAngle = Math.PI * .84;
    nextControls.target.set(0, 0, 0);
    controls.current = nextControls;
    const interrupt = () => { transition.current.active = false; nextControls.enabled = true; };
    gl.domElement.addEventListener("pointerdown", interrupt);
    gl.domElement.addEventListener("wheel", interrupt, { passive: true });
    return () => {
      gl.domElement.removeEventListener("pointerdown", interrupt);
      gl.domElement.removeEventListener("wheel", interrupt);
      nextControls.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const currentControls = controls.current;
    const node = NODE_MAP.get(selected);
    if (!currentControls || !node) return;
    const target = new THREE.Vector3(...node.position);
    const direction = target.clone();
    if (direction.lengthSq() < .01) direction.set(.35, .2, 1);
    direction.normalize();
    const distance = node.kind === "core" ? 15.5 : node.kind === "zone" ? 7.5 : 5.4;
    const destination = target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, node.kind === "provider" ? .65 : 1.35, node.kind === "core" ? 0 : 1.5));
    
    // Compute Bezier Midpoint
    const fromPos = camera.position.clone();
    const toPos = destination.clone();
    const midPoint = fromPos.clone().add(toPos).multiplyScalar(0.5);
    const awayDir = midPoint.clone().sub(target).normalize();
    const dist = fromPos.distanceTo(toPos);
    
    // Push the camera path outward during travel
    midPoint.add(awayDir.multiplyScalar(dist * 0.28));

    transition.current = {
      active: true,
      startedAt: 0,
      duration: reducedMotion ? .01 : selected === "core" && focusVersion === 0 ? 7.2 : 1.8,
      fromPosition: fromPos,
      fromTarget: currentControls.target.clone(),
      toPosition: toPos,
      toTarget: target,
      midPosition: midPoint
    };
    currentControls.enabled = false;
  }, [camera, focusVersion, reducedMotion, selected]);

  useFrame(({ clock }) => {
    const currentControls = controls.current;
    if (!currentControls) return;
    const move = transition.current;
    if (move.active) {
      if (move.startedAt === 0) move.startedAt = clock.elapsedTime;
      const raw = Math.min(1, Math.max(0, (clock.elapsedTime - move.startedAt) / move.duration));
      const eased = raw < .5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      
      // Bezier interpolation
      const t = eased;
      const p0 = move.fromPosition;
      const p1 = move.midPosition;
      const p2 = move.toPosition;
      
      const bezierPos = new THREE.Vector3()
        .copy(p0).multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(p1, 2 * (1 - t) * t)
        .addScaledVector(p2, t * t);
      
      camera.position.copy(bezierPos);
      currentControls.target.lerpVectors(move.fromTarget, move.toTarget, eased);
      
      // Slight roll peaking in the middle of transition
      const rollAngle = Math.sin(t * Math.PI) * 0.08 * (selected === "core" ? -1 : 1);
      camera.rotation.z = rollAngle;
      
      if (raw >= 1) { 
        move.active = false; 
        currentControls.enabled = true; 
        camera.rotation.z = 0;
      }
    } else {
      // Cinematic micro-drift at rest (gentle floating)
      const elapsed = clock.getElapsedTime();
      camera.position.x += Math.sin(elapsed * 0.18) * 0.003;
      camera.position.y += Math.cos(elapsed * 0.15) * 0.002;
      camera.position.z += Math.sin(elapsed * 0.12) * 0.003;
      
      currentControls.target.x += Math.sin(elapsed * 0.22) * 0.001;
      currentControls.target.y += Math.cos(elapsed * 0.18) * 0.001;

      // Scroll depth flight & cosmic galaxy zoom-out
      if (scrollY > 0) {
        const maxScroll = typeof window !== "undefined" ? document.documentElement.scrollHeight - window.innerHeight : 2000;
        const scrollFactor = Math.min(1.0, scrollY / (maxScroll || 2000));

        if (scrollFactor < 0.5) {
          const t = scrollFactor * 2; // 0 to 1
          camera.position.z = camera.position.z * (1.0 - t * 0.5);
          camera.position.y = camera.position.y * (1.0 - t * 0.3) - t * 3.5;
        } else {
          const t = (scrollFactor - 0.5) * 2; // 0 to 1
          const zoomDistance = 15.5 + t * 45.0; // zoom out from 15.5 to 60+ distance
          const dir = camera.position.clone().normalize();
          camera.position.copy(dir.multiplyScalar(zoomDistance));
          currentControls.target.set(0, t * 8.0, 0);
        }
      }
    }
    currentControls.update();
  });

  return null;
}

function UniverseScene({ selected, focusVersion, scrollY, reducedMotion, onSelect }: { selected: NodeId; focusVersion: number; scrollY: number; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  return <>
    <color attach="background" args={["#010207"]} />
    <fog attach="fog" args={["#010207", 18, 72]} />
    <ambientLight intensity={.1} />
    <directionalLight color="#7896ff" intensity={.42} position={[4, 8, 8]} />
    <StarField reducedMotion={reducedMotion} />
    <LivingNetwork reducedMotion={reducedMotion} />
    <CoreNode active={selected === "core"} reducedMotion={reducedMotion} onSelect={onSelect} />
    {NODES.filter((node) => node.id !== "core").map((node) => <IntelligenceNode key={node.id} node={node} active={selected === node.id} reducedMotion={reducedMotion} onSelect={onSelect} />)}
    {selected !== "core" ? <LocalNodeWorld key={selected} node={NODE_MAP.get(selected)!} reducedMotion={reducedMotion} /> : null}
    <CameraRig selected={selected} focusVersion={focusVersion} scrollY={scrollY} reducedMotion={reducedMotion} />
    <EffectComposer multisampling={0}><Bloom intensity={1.02} luminanceThreshold={.24} luminanceSmoothing={.72} mipmapBlur /></EffectComposer>
  </>;
}

// ---------------------------------------------------------------------------
// Canvas Error Boundary — catches WebGL / Three.js failures gracefully
// ---------------------------------------------------------------------------
interface CanvasBoundaryState { hasError: boolean; }
class CanvasErrorBoundary extends Component<{ children: React.ReactNode }, CanvasBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): CanvasBoundaryState { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[UIOS] Canvas/WebGL error caught by boundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 40%, #0d0a1f 0%, #010207 100%)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "1rem", color: "#8899bb", fontFamily: "system-ui, sans-serif",
          }}
          role="status"
          aria-label="UIOS visual unavailable"
        >
          <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}>
            <g stroke="#42d7ff" strokeWidth="0.8" fill="none">
              <path d="M500 304 C438 286 392 238 322 198 S189 143 72 168" />
              <path d="M500 304 C442 330 365 352 302 421 S165 505 42 480" />
              <path d="M500 304 C568 272 619 221 689 190 S830 151 958 92" />
              <path d="M500 304 C558 350 616 374 696 432 S835 516 986 486" />
            </g>
          </svg>
          <span style={{ fontSize: "0.85rem", letterSpacing: "0.1em", position: "relative" }}>UIOS INTELLIGENCE UNIVERSE</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.6, position: "relative" }}>WebGL unavailable in this environment</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function IntelligenceUniverse() {
  const [selected, setSelected] = useState<NodeId>("core");
  const [focusVersion, setFocusVersion] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const hudLockUntil = useRef(0);
  const node = NODE_MAP.get(selected)!;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    
    // Intro sequence: 7.8 seconds
    const timer = window.setTimeout(() => {
      setReady(true);
      // Dispatch completion event to fade in HTML landing details
      window.dispatchEvent(new CustomEvent("uios:cinematic-complete"));
    }, motion.matches ? 0 : 7800);

    return () => { 
      window.clearTimeout(timer); 
      motion.removeEventListener("change", updateMotion); 
      document.body.style.cursor = ""; 
      uiosAudio.close();
    };
  }, []);

  // Synchronized chimes with flickering sparks
  useEffect(() => {
    if (muted) return;
    const timers = [
      window.setTimeout(() => uiosAudio.triggerChime(1), 2200),
      window.setTimeout(() => uiosAudio.triggerChime(3), 2900),
      window.setTimeout(() => uiosAudio.triggerChime(5), 4100),
      window.setTimeout(() => uiosAudio.triggerChime(2), 4800),
      window.setTimeout(() => uiosAudio.triggerChime(0), 5500),
      window.setTimeout(() => uiosAudio.triggerChime(7), 6500),
      window.setTimeout(() => uiosAudio.triggerChime(9), 7200),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [muted]);

  const selectNode = useCallback((id: NodeId) => {
    document.body.style.cursor = "";
    setSelected(id);
    setFocusVersion((version) => version + 1);
    
    const index = NODES.findIndex((item) => item.id === id);
    if (index !== -1 && !muted) {
      uiosAudio.triggerChime(index);
    }
  }, [muted]);

  const selectSpatialNode = useCallback((id: NodeId) => {
    if (performance.now() < hudLockUntil.current) return;
    selectNode(id);
  }, [selectNode]);

  const navigateNode = useCallback((id: NodeId) => {
    hudLockUntil.current = performance.now() + 600;
    selectNode(id);
  }, [selectNode]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (!next) {
        uiosAudio.init();
      }
      uiosAudio.setMute(next);
      return next;
    });
  }, []);

  // Scroll tracking to auto-focus sections and direct camera fly-through
  useEffect(() => {
    const handleScroll = () => {
      const sy = window.scrollY;
      setScrollY(sy);
      
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 100) {
        const pct = sy / maxScroll;
        if (pct < 0.15) {
          setSelected("core");
        } else if (pct < 0.42) {
          setSelected("router");
        } else if (pct < 0.68) {
          setSelected("memory");
        } else if (pct < 0.88) {
          setSelected("aegis");
        } else {
          setSelected("gemini");
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return <section className={`intelligence-universe${ready ? " universe-ready" : ""}`} aria-label="Interactive UIOS intelligence universe">
    <CanvasErrorBoundary>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 8, 40], fov: 48, near: .1, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <Suspense fallback={null}><UniverseScene selected={selected} focusVersion={focusVersion} scrollY={scrollY} reducedMotion={reducedMotion} onSelect={selectSpatialNode} /></Suspense>
      </Canvas>
    </CanvasErrorBoundary>

    <header className="universe-header" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="universe-brand" onClick={() => navigateNode("core")} aria-label="Return to the UIOS Intelligence Core"><span>UI</span><i />S<small>INTELLIGENCE UNIVERSE</small></button>
      <div className="universe-coordinates"><i /> LIVE FABRIC <span>WORLD 003</span></div>
      <div className="universe-header-actions" style={{ justifySelf: "end", display: "flex", gap: "10px", pointerEvents: "auto" }}>
        <button type="button" className={`universe-sound-toggle ${muted ? "" : "active"}`} onClick={toggleMute} aria-label={muted ? "Enable universe audio" : "Disable universe audio"}>{muted ? "🔇 AUDIO MUTED" : "🔊 AUDIO ACTIVE"}</button>
        <button type="button" className="universe-reset" onClick={() => navigateNode("core")}>RESET VIEW <span>⌖</span></button>
      </div>
    </header>

    <nav className="universe-index" aria-label="Intelligence universe locations" onPointerDown={(event) => event.stopPropagation()}>
      <span className="universe-index-title">EXPLORE ZONES</span>
      {NODES.map((item, index) => <button type="button" className={selected === item.id ? "active" : ""} aria-pressed={selected === item.id} onClick={() => navigateNode(item.id)} key={item.id}><span>{String(index + 1).padStart(2, "0")}</span>{item.shortTitle}</button>)}
    </nav>

    <div className="universe-readout" aria-live="polite">
      <span className="universe-readout-category"><i style={{ background: node.color, boxShadow: `0 0 14px ${node.color}` }} />{node.category}</span>
      <h1>{node.title}</h1>
      <p>{node.description}</p>
      <small>SELECT A NODE TO TRAVEL</small>
    </div>

    <div className="universe-controls" aria-label="Camera controls"><span>DRAG</span> ORBIT <i /> <span>SCROLL</span> ZOOM <i /> <span>CLICK</span> DISCOVER</div>
    <div className="universe-reticle" aria-hidden="true"><i /><i /></div>
    <div className="universe-intro" aria-hidden="true">
      <div className="intro-depth-sparks">
        {INTRO_SPARKS.map(([x, y, delay], index) => <i key={`${x}-${y}`} style={{ "--spark-x": `${x}%`, "--spark-y": `${y}%`, "--spark-delay": `${delay}s`, "--spark-color": index % 3 === 0 ? "#b55cff" : "#42d7ff" } as CSSProperties} />)}
      </div>
      <svg className="intro-network" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <g className="intro-network-blue">
          <path pathLength="1" d="M500 304 C438 286 392 238 322 198 S189 143 72 168" />
          <path pathLength="1" d="M500 304 C442 330 365 352 302 421 S165 505 42 480" />
          <path pathLength="1" d="M500 304 C472 247 464 177 416 112 S356 39 318 8" />
        </g>
        <g className="intro-network-violet">
          <path pathLength="1" d="M500 304 C568 272 619 221 689 190 S830 151 958 92" />
          <path pathLength="1" d="M500 304 C558 350 616 374 696 432 S835 516 986 486" />
          <path pathLength="1" d="M500 304 C536 238 558 172 616 100 S692 35 742 4" />
        </g>
      </svg>
      <div className="intro-ignition"><i /><b /></div>
      <div className="intro-crystal">
        <i /><i /><i /><i /><i /><i />
      </div>
      <div className="intro-wordmark">
        <div className="intro-logo-mark"><span>UI</span><i /><span>S</span></div>
        <strong>THE FABRIC OF INTELLIGENCE</strong>
        <small>THE FABRIC OF INTELLIGENCE</small>
      </div>
    </div>
  </section>;
}
