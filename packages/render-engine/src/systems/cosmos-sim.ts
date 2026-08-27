export const KIND_EMPTY = 0;
export const KIND_STAR = 1;
export const KIND_PLANET = 2;
export const KIND_COMET = 3;
export const KIND_HOLE = 4;
export const KIND_REMNANT = 5;
export const KIND_PULSAR = 6;

export const FLAG_GAS = 1;
export const FLAG_RINGS = 2;
export const FLAG_ICE = 4;

export const MAX_BODIES = 128;
export const G = 520;
export const SOFT2 = 640 * 640;
export const SUPERNOVA_MASS = 16800;
export const COLLAPSE_MASS = 22800;
export const PULSAR_MASS = 2400;
export const BURST_POOL = 10;
export const TRAIL_LENGTH = 36;
export const DEBRIS_MAX = 420;
export const STAR_SLOT_MAX = 18;
export const HOLE_SLOT_MAX = 10;
export const PULSAR_SLOT_MAX = 8;

export type SpawnKind = "star" | "planet" | "comet" | "hole" | "pulsar" | "binary";
export type BurstKind = 0 | 1 | 2;

export type Burst = {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  scale: number;
  active: boolean;
  kind: BurstKind;
};

const STAR_HUES = [0.08, 0.12, 0.55, 0.62, 0.95, 0.02, 0.72];

function hypot3(dx: number, dy: number, dz: number) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class CosmosSim {
  readonly px = new Float32Array(MAX_BODIES);
  readonly py = new Float32Array(MAX_BODIES);
  readonly pz = new Float32Array(MAX_BODIES);
  readonly vx = new Float32Array(MAX_BODIES);
  readonly vy = new Float32Array(MAX_BODIES);
  readonly vz = new Float32Array(MAX_BODIES);
  readonly ax = new Float32Array(MAX_BODIES);
  readonly ay = new Float32Array(MAX_BODIES);
  readonly az = new Float32Array(MAX_BODIES);
  readonly mass = new Float32Array(MAX_BODIES);
  readonly radius = new Float32Array(MAX_BODIES);
  readonly heat = new Float32Array(MAX_BODIES);
  readonly hue = new Float32Array(MAX_BODIES);
  readonly kind = new Uint8Array(MAX_BODIES);
  readonly flags = new Uint8Array(MAX_BODIES);
  readonly spin = new Float32Array(MAX_BODIES);
  readonly spinRate = new Float32Array(MAX_BODIES);
  readonly cool = new Float32Array(MAX_BODIES);
  readonly trails = new Float32Array(MAX_BODIES * TRAIL_LENGTH * 3);
  readonly trailHead = new Uint8Array(MAX_BODIES);
  readonly bursts: Burst[] = Array.from({ length: BURST_POOL }, () => ({
    x: 0, y: 0, z: 0, age: 0, life: 1.6, scale: 1, active: false, kind: 0,
  }));

  readonly debrisPx = new Float32Array(DEBRIS_MAX);
  readonly debrisPy = new Float32Array(DEBRIS_MAX);
  readonly debrisPz = new Float32Array(DEBRIS_MAX);
  readonly debrisVx = new Float32Array(DEBRIS_MAX);
  readonly debrisVy = new Float32Array(DEBRIS_MAX);
  readonly debrisVz = new Float32Array(DEBRIS_MAX);
  readonly debrisLife = new Float32Array(DEBRIS_MAX);
  readonly debrisHue = new Float32Array(DEBRIS_MAX);
  debrisCount = 0;

  readonly instanceToBody = new Int16Array(MAX_BODIES);
  instanceCount = 0;
  readonly starSlots: number[] = [];
  readonly holeSlots: number[] = [];
  readonly pulsarSlots: number[] = [];

  timeScale = 1;
  paused = false;
  followId = -1;
  lastBody = -1;
  shake = 0;

  private readonly pairs = new Int16Array(MAX_BODIES * 6);
  private pairCount = 0;
  private debrisCursor = 0;

  constructor() {
    this.seed();
  }

  reset() {
    this.kind.fill(0);
    this.mass.fill(0);
    this.heat.fill(0);
    this.flags.fill(0);
    this.trails.fill(0);
    this.trailHead.fill(0);
    this.cool.fill(0);
    this.debrisLife.fill(0);
    this.debrisCount = 0;
    this.followId = -1;
    this.lastBody = -1;
    this.shake = 0;
    this.paused = false;
    this.timeScale = 1;
    for (const burst of this.bursts) burst.active = false;
    this.seed();
  }

  alloc() {
    for (let i = 0; i < MAX_BODIES; i++) if (this.kind[i] === KIND_EMPTY) return i;
    let weakest = -1;
    let weakestMass = Infinity;
    for (let i = 0; i < MAX_BODIES; i++) {
      if (this.kind[i] === KIND_PLANET || this.kind[i] === KIND_COMET || this.kind[i] === KIND_REMNANT) {
        if (this.mass[i] < weakestMass) {
          weakestMass = this.mass[i];
          weakest = i;
        }
      }
    }
    return weakest;
  }

  spawn(
    kind: number,
    x: number,
    y: number,
    z: number,
    mass: number,
    radius: number,
    vx = 0,
    vy = 0,
    vz = 0,
    hue = 0.12,
    flags = 0,
  ) {
    const i = this.alloc();
    if (i < 0) return -1;
    this.kind[i] = kind;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.mass[i] = mass;
    this.radius[i] = radius;
    this.heat[i] = kind === KIND_STAR || kind === KIND_PULSAR ? 0.42 : kind === KIND_HOLE ? 0.2 : 0;
    this.hue[i] = hue;
    this.flags[i] = flags;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.spinRate[i] = kind === KIND_HOLE ? 1.6 + Math.random() * 1.4 : kind === KIND_PULSAR ? 8 + Math.random() * 10 : 0.22 + Math.random() * 0.4;
    this.cool[i] = 0;
    this.trailHead[i] = 0;
    this.lastBody = i;
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      const o = (i * TRAIL_LENGTH + t) * 3;
      this.trails[o] = x;
      this.trails[o + 1] = y;
      this.trails[o + 2] = z;
    }
    return i;
  }

  spawnTool(tool: SpawnKind, x: number, y: number, z: number, charge = 0.35) {
    const grow = 0.55 + charge * 1.7;
    if (tool === "star") {
      return this.spawn(
        KIND_STAR, x, y, z,
        (6500 + Math.random() * 5200) * grow,
        (380 + Math.random() * 240) * Math.cbrt(grow),
        0, 0, 0,
        STAR_HUES[(Math.random() * STAR_HUES.length) | 0],
      );
    }
    if (tool === "hole") {
      return this.spawn(KIND_HOLE, x, y, z, (14000 + Math.random() * 9000) * grow, (340 + Math.random() * 180) * Math.cbrt(grow), 0, 0, 0, 0.08);
    }
    if (tool === "pulsar") {
      return this.spawn(KIND_PULSAR, x, y, z, (1600 + Math.random() * 900) * grow, 70 + Math.random() * 36, 0, 0, 0, 0.58);
    }
    if (tool === "binary") {
      return this.spawnBinary(x, y, z, grow);
    }
    if (tool === "comet") {
      const speed = 90 + Math.random() * 110 + charge * 80;
      const angle = Math.random() * Math.PI * 2;
      return this.spawn(
        KIND_COMET, x, y, z,
        (70 + Math.random() * 80) * grow, 48 + Math.random() * 28,
        Math.cos(angle) * speed, (Math.random() - 0.5) * 36, Math.sin(angle) * speed,
        0.55,
      );
    }
    const host = this.nearestMassive(x, y, z);
    const orbit = this.orbitalVelocity(host, x, y, z);
    const gas = Math.random() > 0.46 || charge > 0.7;
    const flags = (gas ? FLAG_GAS : 0) | (gas && Math.random() > 0.4 ? FLAG_RINGS : 0) | (!gas && Math.random() > 0.72 ? FLAG_ICE : 0);
    return this.spawn(
      KIND_PLANET, x, y, z,
      (200 + Math.random() * 520) * grow,
      (80 + Math.random() * 150) * Math.cbrt(grow),
      orbit.vx, orbit.vy, orbit.vz,
      gas ? 0.08 + Math.random() * 0.18 : 0.18 + Math.random() * 0.62,
      flags,
    );
  }

  spawnBinary(x: number, y: number, z: number, grow = 1) {
    const sep = 2400 + grow * 900;
    const m1 = (5400 + Math.random() * 2800) * grow;
    const m2 = (4200 + Math.random() * 2400) * grow;
    const a = Math.random() * Math.PI * 2;
    const total = m1 + m2;
    const r1 = sep * (m2 / total);
    const r2 = sep * (m1 / total);
    const speed = Math.sqrt((G * total) / sep);
    const a1 = this.spawn(
      KIND_STAR,
      x + Math.cos(a) * r1, y, z + Math.sin(a) * r1,
      m1, 340 + m1 * 0.03,
      -Math.sin(a) * speed * (m2 / total), 4, Math.cos(a) * speed * (m2 / total),
      0.08,
    );
    this.spawn(
      KIND_STAR,
      x - Math.cos(a) * r2, y + 80, z - Math.sin(a) * r2,
      m2, 300 + m2 * 0.03,
      Math.sin(a) * speed * (m1 / total), -4, -Math.cos(a) * speed * (m1 / total),
      0.58,
    );
    return a1;
  }

  launchFrom(source: number, x: number, y: number, z: number) {
    const dx = x - this.px[source];
    const dy = y - this.py[source];
    const dz = z - this.pz[source];
    const orbit = this.orbitalVelocity(source, x, y, z);
    const kick = 0.1;
    const gas = this.kind[source] === KIND_STAR && Math.random() > 0.55;
    return this.spawn(
      KIND_PLANET, x, y, z,
      160 + Math.random() * 380,
      64 + Math.random() * 110,
      orbit.vx + dx * kick, orbit.vy + dy * kick * 0.35, orbit.vz + dz * kick,
      gas ? 0.1 : 0.22 + Math.random() * 0.55,
      gas ? FLAG_GAS | (Math.random() > 0.5 ? FLAG_RINGS : 0) : 0,
    );
  }

  nearestMassive(x: number, y: number, z: number) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < MAX_BODIES; i++) {
      const kind = this.kind[i];
      if (kind !== KIND_STAR && kind !== KIND_HOLE && kind !== KIND_PULSAR) continue;
      const d2 = (this.px[i] - x) ** 2 + (this.py[i] - y) ** 2 + (this.pz[i] - z) ** 2;
      const score = this.mass[i] / (d2 + 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  nearestStar(i: number) {
    let best = -1;
    let bestD2 = Infinity;
    for (let j = 0; j < MAX_BODIES; j++) {
      if (this.kind[j] !== KIND_STAR || j === i) continue;
      const d2 = (this.px[j] - this.px[i]) ** 2 + (this.py[j] - this.py[i]) ** 2 + (this.pz[j] - this.pz[i]) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    return best;
  }

  orbitalVelocity(host: number, x: number, y: number, z: number) {
    if (host < 0) return { vx: 0, vy: 0, vz: 0 };
    const dx = x - this.px[host];
    const dy = y - this.py[host];
    const dz = z - this.pz[host];
    const r = hypot3(dx, dy, dz) || 1;
    const speed = Math.sqrt((G * this.mass[host]) / Math.max(r, 400));
    const tilt = 0.18;
    return {
      vx: this.vx[host] + (-dz / r) * speed + (dy / r) * speed * tilt,
      vy: this.vy[host] + (dx / r) * speed * tilt * 0.6,
      vz: this.vz[host] + (dx / r) * speed,
    };
  }

  nudgeTime(dir: number) {
    this.timeScale = Math.min(4, Math.max(0.2, this.timeScale * (dir > 0 ? 1.45 : 1 / 1.45)));
  }

  togglePause() {
    this.paused = !this.paused;
  }

  toggleFollow() {
    if (this.followId >= 0) {
      this.followId = -1;
      return;
    }
    this.followId = this.lastBody;
  }

  step(dt: number) {
    if (this.paused) {
      this.ageBursts(dt * 0.35);
      return;
    }
    const h = Math.min(0.05, Math.max(0.006, dt)) * this.timeScale * 1.28;
    const substeps = h > 0.028 ? 2 : 1;
    const slice = h / substeps;
    for (let s = 0; s < substeps; s++) this.integrate(slice);
    this.stepDebris(h);
    this.ageBursts(h);
    this.shake *= 0.86;
  }

  syncVisualSlots() {
    this.instanceCount = 0;
    this.starSlots.length = 0;
    this.holeSlots.length = 0;
    this.pulsarSlots.length = 0;
    for (let i = 0; i < MAX_BODIES; i++) {
      const kind = this.kind[i];
      if (kind === KIND_EMPTY) continue;
      if (kind === KIND_STAR && this.starSlots.length < STAR_SLOT_MAX) this.starSlots.push(i);
      else if (kind === KIND_HOLE && this.holeSlots.length < HOLE_SLOT_MAX) this.holeSlots.push(i);
      else if (kind === KIND_PULSAR && this.pulsarSlots.length < PULSAR_SLOT_MAX) this.pulsarSlots.push(i);
      else {
        this.instanceToBody[this.instanceCount] = i;
        this.instanceCount += 1;
      }
    }
    if (this.followId >= 0 && this.kind[this.followId] === KIND_EMPTY) this.followId = this.lastBody >= 0 && this.kind[this.lastBody] ? this.lastBody : -1;
  }

  private integrate(h: number) {
    this.ax.fill(0);
    this.ay.fill(0);
    this.az.fill(0);
    this.pairCount = 0;

    for (let i = 0; i < MAX_BODIES; i++) {
      if (this.kind[i] === KIND_EMPTY) continue;
      const gi = this.kind[i] === KIND_HOLE ? 1.55 : this.kind[i] === KIND_PULSAR ? 1.22 : 1;
      for (let j = i + 1; j < MAX_BODIES; j++) {
        if (this.kind[j] === KIND_EMPTY) continue;
        const dx = this.px[j] - this.px[i];
        const dy = this.py[j] - this.py[i];
        const dz = this.pz[j] - this.pz[i];
        const dist2 = dx * dx + dy * dy + dz * dz + SOFT2;
        const dist = Math.sqrt(dist2);
        const gj = this.kind[j] === KIND_HOLE ? 1.55 : this.kind[j] === KIND_PULSAR ? 1.22 : 1;
        const force = G / (dist2 * dist);
        this.ax[i] += dx * this.mass[j] * force * gj;
        this.ay[i] += dy * this.mass[j] * force * gj;
        this.az[i] += dz * this.mass[j] * force * gj;
        this.ax[j] -= dx * this.mass[i] * force * gi;
        this.ay[j] -= dy * this.mass[i] * force * gi;
        this.az[j] -= dz * this.mass[i] * force * gi;

        if ((this.kind[i] === KIND_HOLE || this.kind[j] === KIND_HOLE) && dist < 18000) {
          const hole = this.kind[i] === KIND_HOLE ? i : j;
          const other = hole === i ? j : i;
          const drag = (this.spinRate[hole] * 42) / (dist2);
          this.ax[other] += -dz * drag;
          this.az[other] += dx * drag;
        }

        const contact = this.radius[i] + this.radius[j];
        if (dist - Math.sqrt(SOFT2) < contact && this.pairCount < this.pairs.length - 1) {
          this.pairs[this.pairCount++] = i;
          this.pairs[this.pairCount++] = j;
        }
      }
    }

    for (let i = 0; i < MAX_BODIES; i++) {
      if (this.kind[i] === KIND_EMPTY) continue;
      if (this.kind[i] === KIND_COMET) this.radiate(i, 0.018);
      const r2 = this.px[i] * this.px[i] + this.py[i] * this.py[i] + this.pz[i] * this.pz[i];
      if (r2 > 2.6e6 * 2.6e6) {
        const inv = 1 / Math.sqrt(r2);
        this.ax[i] -= this.px[i] * inv * 18;
        this.ay[i] -= this.py[i] * inv * 18;
        this.az[i] -= this.pz[i] * inv * 18;
      }
      this.vx[i] += this.ax[i] * h;
      this.vy[i] += this.ay[i] * h;
      this.vz[i] += this.az[i] * h;
      this.px[i] += this.vx[i] * h;
      this.py[i] += this.vy[i] * h;
      this.pz[i] += this.vz[i] * h;
      this.heat[i] = Math.max(0, this.heat[i] * (1 - 0.012 * h * 60) );
      this.spin[i] += h * this.spinRate[i];
      this.cool[i] = Math.max(0, this.cool[i] - h);
      if (this.kind[i] === KIND_COMET) this.recordTrail(i);
      this.evolve(i, h);
    }

    for (let p = 0; p < this.pairCount; p += 2) {
      const i = this.pairs[p];
      const j = this.pairs[p + 1];
      if (this.kind[i] && this.kind[j]) this.collide(i, j);
    }

    this.tidalShred();
  }

  private radiate(i: number, strength: number) {
    const star = this.nearestStar(i);
    if (star < 0) return;
    const dx = this.px[i] - this.px[star];
    const dy = this.py[i] - this.py[star];
    const dz = this.pz[i] - this.pz[star];
    const d2 = dx * dx + dy * dy + dz * dz + 40000;
    const inv = strength * this.mass[star] / d2;
    this.ax[i] += dx * inv;
    this.ay[i] += dy * inv;
    this.az[i] += dz * inv;
  }

  private evolve(i: number, h: number) {
    const kind = this.kind[i];
    if (kind === KIND_STAR) {
      this.heat[i] = Math.min(1, this.heat[i] + this.mass[i] * 0.0000018 * h);
      if (this.mass[i] > SUPERNOVA_MASS && this.heat[i] > 0.78) this.supernova(i);
      else if (this.heat[i] > 0.68 && this.cool[i] <= 0) {
        this.burstAt(this.px[i], this.py[i], this.pz[i], this.radius[i] * 3.4, 0.45, 0);
        this.heat[i] *= 0.72;
        this.cool[i] = 1.8;
        this.shake = Math.max(this.shake, 90);
      }
    } else if (kind === KIND_PULSAR) {
      this.heat[i] = 0.85 + 0.15 * Math.sin(this.spin[i] * 3);
    } else if (kind === KIND_HOLE && this.heat[i] > 0.4 && this.cool[i] <= 0) {
      this.cool[i] = 0.8;
    }
  }

  private tidalShred() {
    for (let i = 0; i < MAX_BODIES; i++) {
      const kind = this.kind[i];
      if (kind !== KIND_PLANET && kind !== KIND_COMET && kind !== KIND_REMNANT) continue;
      for (let j = 0; j < MAX_BODIES; j++) {
        const host = this.kind[j];
        if (host !== KIND_STAR && host !== KIND_HOLE && host !== KIND_PULSAR) continue;
        const dx = this.px[i] - this.px[j];
        const dy = this.py[i] - this.py[j];
        const dz = this.pz[i] - this.pz[j];
        const dist = hypot3(dx, dy, dz);
        const roche = this.radius[j] * (host === KIND_HOLE ? 7.4 : host === KIND_PULSAR ? 5.2 : 2.8);
        if (dist < roche && dist > this.radius[j] * 1.05) {
          this.heat[i] = Math.min(1, this.heat[i] + 0.08);
          if (dist < roche * 0.62) {
            this.shred(i, j);
            break;
          }
        }
      }
    }
  }

  private recordTrail(i: number) {
    const head = this.trailHead[i];
    const o = (i * TRAIL_LENGTH + head) * 3;
    this.trails[o] = this.px[i];
    this.trails[o + 1] = this.py[i];
    this.trails[o + 2] = this.pz[i];
    this.trailHead[i] = (head + 1) % TRAIL_LENGTH;
  }

  private collide(i: number, j: number) {
    const ki = this.kind[i];
    const kj = this.kind[j];
    if (ki === KIND_HOLE || kj === KIND_HOLE) {
      if (ki === KIND_HOLE && kj === KIND_HOLE) {
        this.mergeHoles(i, j);
        return;
      }
      const hole = ki === KIND_HOLE ? i : j;
      const prey = hole === i ? j : i;
      this.swallow(hole, prey);
      return;
    }

    const dvx = this.vx[i] - this.vx[j];
    const dvy = this.vy[i] - this.vy[j];
    const dvz = this.vz[i] - this.vz[j];
    const rel = hypot3(dvx, dvy, dvz);
    const rocky = (k: number) => k === KIND_PLANET || k === KIND_COMET || k === KIND_REMNANT;
    if (rel > 155 && rocky(ki) && rocky(kj)) {
      this.shatter(i, j);
      return;
    }

    if (rel < 48 && rocky(ki) && rocky(kj) && Math.abs(this.mass[i] - this.mass[j]) < this.mass[i] * 0.35) {
      const nx = this.px[j] - this.px[i];
      const ny = this.py[j] - this.py[i];
      const nz = this.pz[j] - this.pz[i];
      const n = hypot3(nx, ny, nz) || 1;
      const push = 18 / n;
      this.vx[i] -= nx * push;
      this.vy[i] -= ny * push;
      this.vz[i] -= nz * push;
      this.vx[j] += nx * push;
      this.vy[j] += ny * push;
      this.vz[j] += nz * push;
      return;
    }

    const survivor = this.mass[i] >= this.mass[j] ? i : j;
    const prey = survivor === i ? j : i;
    const total = this.mass[survivor] + this.mass[prey];
    this.vx[survivor] = (this.vx[survivor] * this.mass[survivor] + this.vx[prey] * this.mass[prey]) / total;
    this.vy[survivor] = (this.vy[survivor] * this.mass[survivor] + this.vy[prey] * this.mass[prey]) / total;
    this.vz[survivor] = (this.vz[survivor] * this.mass[survivor] + this.vz[prey] * this.mass[prey]) / total;
    this.radius[survivor] = Math.cbrt(this.radius[survivor] ** 3 + this.radius[prey] ** 3);
    this.mass[survivor] = total;
    this.heat[survivor] = Math.min(1, this.heat[survivor] + 0.42 + rel * 0.002);
    this.flags[survivor] |= this.flags[prey] & (FLAG_GAS | FLAG_RINGS | FLAG_ICE);
    this.emitDebris(this.px[prey], this.py[prey], this.pz[prey], 8, 0.12, 70);
    this.kind[prey] = KIND_EMPTY;

    if ((ki === KIND_STAR || kj === KIND_STAR) && (ki === KIND_PULSAR || kj === KIND_PULSAR || total > COLLAPSE_MASS * 0.45)) {
      this.kind[survivor] = KIND_STAR;
    }

    if (this.kind[survivor] === KIND_STAR && total > COLLAPSE_MASS) {
      this.kind[survivor] = KIND_HOLE;
      this.hue[survivor] = 0.08;
      this.spinRate[survivor] = 2.4;
      this.burstAt(this.px[survivor], this.py[survivor], this.pz[survivor], this.radius[survivor] * 10, 1.2, 1);
      this.shake = 220;
    } else if (this.kind[survivor] === KIND_STAR && total > SUPERNOVA_MASS) {
      this.supernova(survivor);
    } else if (this.kind[survivor] === KIND_REMNANT && total > PULSAR_MASS) {
      this.kind[survivor] = KIND_PULSAR;
      this.hue[survivor] = 0.58;
      this.radius[survivor] = Math.min(120, this.radius[survivor] * 0.45);
      this.spinRate[survivor] = 9;
      this.burstAt(this.px[survivor], this.py[survivor], this.pz[survivor], this.radius[survivor] * 8, 0.8, 0);
    } else if (ki === KIND_STAR || kj === KIND_STAR) {
      this.kind[survivor] = KIND_STAR;
    }
  }

  private mergeHoles(i: number, j: number) {
    const survivor = this.mass[i] >= this.mass[j] ? i : j;
    const prey = survivor === i ? j : i;
    const total = this.mass[survivor] + this.mass[prey];
    this.vx[survivor] = (this.vx[survivor] * this.mass[survivor] + this.vx[prey] * this.mass[prey]) / total;
    this.vy[survivor] = (this.vy[survivor] * this.mass[survivor] + this.vy[prey] * this.mass[prey]) / total;
    this.vz[survivor] = (this.vz[survivor] * this.mass[survivor] + this.vz[prey] * this.mass[prey]) / total;
    this.mass[survivor] = total;
    this.radius[survivor] = Math.min(1800, this.radius[survivor] * 1.18 + this.radius[prey] * 0.22);
    this.spinRate[survivor] += this.spinRate[prey] * 0.4;
    this.heat[survivor] = 1;
    this.burstAt(this.px[survivor], this.py[survivor], this.pz[survivor], this.radius[survivor] * 22, 2.2, 1);
    this.emitDebris(this.px[prey], this.py[prey], this.pz[prey], 18, 0.08, 160);
    this.kind[prey] = KIND_EMPTY;
    this.shake = 320;
  }

  private swallow(hole: number, prey: number) {
    const total = this.mass[hole] + this.mass[prey];
    this.vx[hole] = (this.vx[hole] * this.mass[hole] + this.vx[prey] * this.mass[prey]) / total;
    this.vy[hole] = (this.vy[hole] * this.mass[hole] + this.vy[prey] * this.mass[prey]) / total;
    this.vz[hole] = (this.vz[hole] * this.mass[hole] + this.vz[prey] * this.mass[prey]) / total;
    this.mass[hole] = total;
    this.radius[hole] = Math.min(1600, this.radius[hole] * (1 + this.mass[prey] / (total * 2.6)));
    this.heat[hole] = 1;
    this.spinRate[hole] = Math.min(4.8, this.spinRate[hole] + 0.12);
    this.burstAt(this.px[prey], this.py[prey], this.pz[prey], this.radius[prey] * 7, 0.7, 2);
    this.emitDebris(this.px[prey], this.py[prey], this.pz[prey], 10, 0.06, 90);
    this.kind[prey] = KIND_EMPTY;
    this.shake = Math.max(this.shake, 70);
  }

  private shred(prey: number, host: number) {
    const x = this.px[prey];
    const y = this.py[prey];
    const z = this.pz[prey];
    const leftover = this.mass[prey] * 0.55;
    this.burstAt(x, y, z, this.radius[prey] * 6, 0.55, 2);
    this.emitDebris(x, y, z, 14, this.hue[prey], 80);
    this.kind[prey] = KIND_EMPTY;
    for (let n = 0; n < 3; n++) {
      const a = (n / 3) * Math.PI * 2 + this.spin[host];
      this.spawn(
        KIND_REMNANT,
        x + Math.cos(a) * 220, y + (Math.random() - 0.5) * 90, z + Math.sin(a) * 220,
        leftover / 3, 32 + Math.random() * 24,
        this.vx[host] + Math.cos(a) * 70, this.vy[host], this.vz[host] + Math.sin(a) * 70,
        0.08,
      );
    }
  }

  private shatter(i: number, j: number) {
    const x = (this.px[i] + this.px[j]) * 0.5;
    const y = (this.py[i] + this.py[j]) * 0.5;
    const z = (this.pz[i] + this.pz[j]) * 0.5;
    const leftover = (this.mass[i] + this.mass[j]) * 0.24;
    this.burstAt(x, y, z, Math.max(this.radius[i], this.radius[j]) * 11, 0.95, 0);
    this.emitDebris(x, y, z, 16, 0.08, 110);
    this.kind[i] = KIND_EMPTY;
    this.kind[j] = KIND_EMPTY;
    this.shake = Math.max(this.shake, 110);
    for (let n = 0; n < 4; n++) {
      const angle = (n / 4) * Math.PI * 2 + Math.random();
      this.spawn(
        KIND_REMNANT,
        x + Math.cos(angle) * 200, y + (Math.random() - 0.5) * 90, z + Math.sin(angle) * 200,
        leftover / 4, 36 + Math.random() * 28,
        Math.cos(angle) * 100, (Math.random() - 0.5) * 50, Math.sin(angle) * 100,
        0.07,
      );
    }
  }

  private supernova(i: number) {
    const x = this.px[i];
    const y = this.py[i];
    const z = this.pz[i];
    const leftover = this.mass[i];
    const vx = this.vx[i];
    const vy = this.vy[i];
    const vz = this.vz[i];
    this.burstAt(x, y, z, this.radius[i] * 22, 2.1, 0);
    this.burstAt(x, y, z, this.radius[i] * 34, 2.6, 1);
    this.emitDebris(x, y, z, 28, 0.08, 220);
    this.kind[i] = KIND_EMPTY;
    this.shake = 280;
    if (leftover > COLLAPSE_MASS) {
      this.spawn(KIND_HOLE, x, y, z, leftover * 0.2, 400, vx * 0.18, vy * 0.18, vz * 0.18, 0.08);
    } else if (leftover > PULSAR_MASS * 3.2) {
      this.spawn(KIND_PULSAR, x, y, z, leftover * 0.08, 88, vx * 0.12, vy * 0.12, vz * 0.12, 0.58);
    } else {
      this.spawn(KIND_REMNANT, x, y, z, leftover * 0.1, 150, vx * 0.14, vy * 0.14, vz * 0.14, 0.95);
    }
    for (let n = 0; n < 8; n++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 180 + Math.random() * 260;
      const ox = Math.sin(phi) * Math.cos(theta);
      const oy = Math.cos(phi);
      const oz = Math.sin(phi) * Math.sin(theta);
      this.spawn(KIND_REMNANT, x + ox * 280, y + oy * 280, z + oz * 280, leftover * 0.022, 42 + Math.random() * 32, ox * speed, oy * speed, oz * speed, 0.04 + Math.random() * 0.12);
    }
  }

  private burstAt(x: number, y: number, z: number, scale: number, life: number, kind: BurstKind) {
    const burst = this.bursts.find((item) => !item.active) ?? this.bursts[0];
    burst.x = x;
    burst.y = y;
    burst.z = z;
    burst.scale = scale;
    burst.life = life;
    burst.age = 0;
    burst.active = true;
    burst.kind = kind;
  }

  private emitDebris(x: number, y: number, z: number, count: number, hue: number, speed: number) {
    for (let n = 0; n < count; n++) {
      const i = this.debrisCursor;
      this.debrisCursor = (this.debrisCursor + 1) % DEBRIS_MAX;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const ox = Math.sin(phi) * Math.cos(theta);
      const oy = Math.cos(phi);
      const oz = Math.sin(phi) * Math.sin(theta);
      const v = speed * (0.4 + Math.random());
      this.debrisPx[i] = x + ox * 40;
      this.debrisPy[i] = y + oy * 40;
      this.debrisPz[i] = z + oz * 40;
      this.debrisVx[i] = ox * v;
      this.debrisVy[i] = oy * v;
      this.debrisVz[i] = oz * v;
      this.debrisLife[i] = 1.2 + Math.random() * 2.4;
      this.debrisHue[i] = hue;
    }
    this.debrisCount = DEBRIS_MAX;
  }

  private stepDebris(h: number) {
    let live = 0;
    const host = this.starSlots[0] ?? this.nearestMassive(0, 0, 0);
    for (let i = 0; i < DEBRIS_MAX; i++) {
      if (this.debrisLife[i] <= 0) continue;
      this.debrisLife[i] -= h * 0.55;
      if (host >= 0) {
        const dx = this.px[host] - this.debrisPx[i];
        const dy = this.py[host] - this.debrisPy[i];
        const dz = this.pz[host] - this.debrisPz[i];
        const d2 = dx * dx + dy * dy + dz * dz + 8000;
        const pull = (G * this.mass[host] * 0.35) / (d2 * Math.sqrt(d2));
        this.debrisVx[i] += dx * pull * h;
        this.debrisVy[i] += dy * pull * h;
        this.debrisVz[i] += dz * pull * h;
      }
      this.debrisPx[i] += this.debrisVx[i] * h;
      this.debrisPy[i] += this.debrisVy[i] * h;
      this.debrisPz[i] += this.debrisVz[i] * h;
      live += 1;
    }
    this.debrisCount = live;
  }

  private ageBursts(h: number) {
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.age += h;
      if (burst.age >= burst.life) burst.active = false;
    }
  }

  private seed() {
    const primary = this.spawnBinary(0, 0, 0, 1.15);
    for (let n = 1; n <= 5; n++) {
      const radius = 5600 + n * 3200 + Math.random() * 500;
      const angle = (n / 5) * Math.PI * 2 + 0.35;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius * 0.92;
      const py = (n - 3) * 180;
      const orbit = this.orbitalVelocity(primary, px, py, pz);
      const gas = n >= 4;
      this.spawn(
        KIND_PLANET, px, py, pz,
        gas ? 520 + n * 40 : 180 + n * 70,
        gas ? 160 + n * 12 : 72 + n * 16,
        orbit.vx, orbit.vy, orbit.vz,
        gas ? 0.08 + n * 0.02 : 0.2 + n * 0.08,
        gas ? FLAG_GAS | (n === 4 ? FLAG_RINGS : 0) : n === 1 ? FLAG_ICE : 0,
      );
    }
    this.seedSystem(126000, 7200, -88000, 8200, 0.58);
    this.seedSystem(-138000, -3600, 82000, 9100, 0.95);
    this.seedSystem(38000, 21000, 162000, 6800, 0.08);
    this.seedSystem(-72000, -16000, -154000, 7400, 0.72);
    this.spawn(KIND_HOLE, 196000, 2800, 172000, 24000, 560, 6, 0, -10, 0.08);
    this.spawn(KIND_HOLE, -188000, -7400, -142000, 19000, 470, -5, 2, 9, 0.08);
    this.spawn(KIND_PULSAR, 64000, 28000, -42000, 2100, 92, 12, -6, 18, 0.58);
    this.spawn(KIND_PULSAR, -54000, -24000, 98000, 1800, 78, -8, 4, -14, 0.62);

    for (let n = 0; n < 18; n++) {
      const angle = (n / 18) * Math.PI * 2;
      const r = 28000 + (n % 5) * 2200;
      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r * 0.86;
      const py = (n % 2 === 0 ? 1 : -1) * 420;
      const orbit = this.orbitalVelocity(primary, px, py, pz);
      this.spawn(KIND_REMNANT, px, py, pz, 40 + n * 3, 28 + (n % 4) * 6, orbit.vx, orbit.vy, orbit.vz, 0.1);
    }

    for (let n = 0; n < 10; n++) {
      const angle = (n / 10) * Math.PI * 2 + 0.4;
      const r = 74000 + n * 11000;
      this.spawn(
        KIND_COMET,
        Math.cos(angle) * r, (n % 2 === 0 ? 1 : -1) * 11000, Math.sin(angle) * r * 0.7,
        70 + n * 9, 46,
        -Math.sin(angle) * 120, (n % 2 === 0 ? -1 : 1) * 22, Math.cos(angle) * 120,
        0.55,
      );
    }

    this.spawn(KIND_STAR, -210000, 48000, 40000, 5200, 320, 38, -8, -22, 0.02);
  }

  private seedSystem(x: number, y: number, z: number, sunMass: number, hue: number) {
    const sun = this.spawn(KIND_STAR, x, y, z, sunMass, 360 + sunMass * 0.03, 0, 0, 0, hue);
    const planets = 5 + ((sunMass / 3800) | 0);
    for (let n = 1; n <= planets; n++) {
      const radius = 3800 + n * 3600 + Math.random() * 1100;
      const angle = Math.random() * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const py = y + (Math.random() - 0.5) * 620;
      const orbit = this.orbitalVelocity(sun, px, py, pz);
      const gas = n >= planets - 2;
      this.spawn(
        n === planets ? KIND_COMET : KIND_PLANET,
        px, py, pz,
        gas ? 380 + n * 70 : 140 + n * 80,
        gas ? 140 + n * 18 : 64 + n * 20,
        orbit.vx, orbit.vy, orbit.vz,
        gas ? 0.07 + n * 0.03 : 0.16 + n * 0.1,
        gas ? FLAG_GAS | (n === planets - 1 ? FLAG_RINGS : 0) : n === 1 ? FLAG_ICE : 0,
      );
    }
  }
}
