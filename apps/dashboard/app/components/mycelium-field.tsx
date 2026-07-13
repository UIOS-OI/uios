"use client";

import { useEffect, useRef } from "react";

type Branch = { points: Array<{ x: number; y: number; z: number }>; hue: number; phase: number };
const nodes = [
  ["OPENAI", -.34, -.36, "#d9ecff"], ["AI MODELS", 0, -.48, "#b4c7ff"], ["ANTHROPIC", .34, -.36, "#d9ecff"],
  ["GOOGLE", -.47, .12, "#a7d7ff"], ["META", .47, .12, "#a7d7ff"], ["AEGIS SECURITY", -.39, .42, "#b8aaff"],
  ["KNOWLEDGE", -.13, .47, "#b8aaff"], ["WORKFLOWS", .15, .47, "#b8aaff"], ["AI AGENTS", .4, .42, "#b8aaff"],
] as const;

function createBranches(seed: number, count: number): Branch[] {
  let value = seed;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (random() - .5) * .32;
    const points = Array.from({ length: 13 }, (_, point) => {
      const distance = point / 12;
      const drift = Math.sin(point * .9 + index) * (12 + distance * 30);
      return { x: Math.cos(angle) * (distance * 390 + drift), y: Math.sin(angle) * (distance * 245 + drift * .6), z: distance * .8 + random() * .2 };
    });
    return { points, hue: 216 + random() * 58, phase: random() * Math.PI * 2 };
  });
}

const branches = createBranches(31, 34);

export function MyceliumField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animation = 0;
    const resize = () => { const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const draw = (time: number) => {
      const width = canvas.clientWidth; const height = canvas.clientHeight; context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * .5, height * .52, 0, width * .5, height * .52, Math.max(width, height) * .74);
      glow.addColorStop(0, "rgba(100, 93, 255, .16)"); glow.addColorStop(.43, "rgba(42, 134, 255, .07)"); glow.addColorStop(1, "rgba(2, 7, 22, 0)"); context.fillStyle = glow; context.fillRect(0, 0, width, height);
      const pulseTime = reducedMotion ? 0 : time * .001;
      const rotation = pulseTime * .08;
      branches.forEach((branch) => {
        const projected = branch.points.map((point) => { const angle = rotation + branch.phase * .025; const cos = Math.cos(angle); const sin = Math.sin(angle); const rx = point.x * cos - point.y * sin; const ry = point.x * sin + point.y * cos; const perspective = .72 + point.z * .38; return { x: width * .5 + rx * perspective + pointer.current.x * (8 + point.z * 14), y: height * .52 + ry * perspective + pointer.current.y * (6 + point.z * 11), z: point.z }; });
        context.beginPath(); projected.forEach((point, index) => { if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
        const depth = .78 + Math.sin(branch.phase) * .12; const alpha = .1 + depth * .18; context.strokeStyle = `hsla(${branch.hue}, 92%, 68%, ${alpha})`; context.lineWidth = .45 + depth * 1.15; context.shadowBlur = 7; context.shadowColor = `hsla(${branch.hue}, 100%, 70%, .25)`; context.stroke(); context.shadowBlur = 0;
        const pulse = (Math.sin(pulseTime * 1.4 + branch.phase) + 1) / 2;
        const tipPoint = projected[Math.floor(pulse * (projected.length - 1))]; context.beginPath(); context.arc(tipPoint.x, tipPoint.y, 1.2 + pulse * 2.2, 0, Math.PI * 2); context.fillStyle = `hsla(${branch.hue}, 100%, 78%, ${.35 + pulse * .35})`; context.fill();
      });
      const centerX = width * .5 + pointer.current.x * 18; const centerY = height * .52 + pointer.current.y * 13; const breathe = reducedMotion ? 0 : Math.sin(pulseTime * 2) * 2;
      const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 44 + breathe); core.addColorStop(0, "rgba(255,255,255,.95)"); core.addColorStop(.12, "rgba(161,150,255,.9)"); core.addColorStop(.38, "rgba(83,123,255,.42)"); core.addColorStop(1, "rgba(71,69,255,0)"); context.fillStyle = core; context.beginPath(); context.arc(centerX, centerY, 44 + breathe, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(centerX, centerY, 8 + breathe * .3, 0, Math.PI * 2); context.fillStyle = "rgba(220, 214, 255, .92)"; context.shadowBlur = 28; context.shadowColor = "#7869ff"; context.fill(); context.shadowBlur = 0;
      context.save(); context.textAlign = "center"; context.textBaseline = "middle"; context.font = "600 26px ui-sans-serif, system-ui, sans-serif"; context.fillStyle = "rgba(247,248,255,.96)"; context.shadowBlur = 18; context.shadowColor = "rgba(97,123,255,.8)"; context.fillText("UIOS", centerX, centerY - 34); context.shadowBlur = 0; context.font = "500 8px ui-monospace, SFMono-Regular, monospace"; context.fillStyle = "rgba(201,211,255,.82)"; context.fillText("T H E   F A B R I C   O F   I N T E L L I G E N C E", centerX, centerY + 40); context.restore();
      nodes.forEach(([label, nx, ny, color], index) => {
        const orbit = reducedMotion ? 0 : Math.sin(pulseTime * .35 + index) * 3; const x = width * (.5 + nx) + pointer.current.x * (8 + index % 3 * 4) + orbit * (ny + .5); const y = height * (.52 + ny) + pointer.current.y * (6 + index % 2 * 4) + orbit * (nx + .5); const radius = Math.max(10, Math.min(17, width * .014));
        const bubble = context.createRadialGradient(x - radius * .3, y - radius * .4, 1, x, y, radius * 1.8); bubble.addColorStop(0, "rgba(173,203,255,.48)"); bubble.addColorStop(.45, "rgba(66,96,211,.28)"); bubble.addColorStop(1, "rgba(38,32,111,.08)"); context.fillStyle = bubble; context.beginPath(); context.arc(x, y, radius * 1.6, 0, Math.PI * 2); context.fill(); context.strokeStyle = "rgba(137,177,255,.38)"; context.lineWidth = 1; context.stroke();
        context.fillStyle = color; context.shadowBlur = 13; context.shadowColor = color; context.beginPath(); context.arc(x, y, 2.1, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0; context.font = "500 8px ui-monospace, SFMono-Regular, monospace"; context.fillStyle = "rgba(220,229,255,.78)"; context.textAlign = "center"; context.fillText(label, x, y + radius * 2.05);
      });
      if (!reducedMotion) animation = requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); pointer.current = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: (event.clientY - rect.top) / rect.height * 2 - 1 }; };
    resize(); draw(0); if (!reducedMotion) animation = requestAnimationFrame(draw); window.addEventListener("resize", resize); canvas.addEventListener("pointermove", move, { passive: true });
    return () => { cancelAnimationFrame(animation); window.removeEventListener("resize", resize); canvas.removeEventListener("pointermove", move); };
  }, []);
  return <div className="mycelium-field" aria-label="Interactive visualization of the UIOS fabric of intelligence" role="img"><canvas ref={canvasRef} /><div className="mycelium-label"><span className="mycelium-signal" /> fabric_of_intelligence <small>move to explore</small></div></div>;
}
