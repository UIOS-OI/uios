export const starVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aScale;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  uniform float uTime;
  void main() {
    vColor = aColor;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(8.0, -viewPosition.z);
    gl_PointSize = max(1.2, aScale * uPixelRatio * (190000.0 / dist));
    gl_PointSize = min(gl_PointSize, 16.0 * uPixelRatio);
    gl_PointSize *= 0.86 + 0.14 * sin(uTime * (0.35 + aScale * 0.16) + position.x * 0.00001);
    gl_Position = projectionMatrix * viewPosition;
    #include <logdepthbuf_vertex>
  }
`;

export const starFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.2, 0.0, d);
    float halo = smoothstep(0.5, 0.06, d);
    vec3 color = vColor * (core * 2.05 + halo * 0.62);
    float alpha = core + halo * 0.46;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
  }
`;

export const debrisVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aLife;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vLife;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vLife = aLife;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(10.0, -viewPosition.z);
    gl_PointSize = max(1.4, (10.0 + aLife * 18.0) * uPixelRatio * (120000.0 / dist));
    gl_PointSize = min(gl_PointSize, 22.0 * uPixelRatio);
    gl_Position = projectionMatrix * viewPosition;
    #include <logdepthbuf_vertex>
  }
`;

export const debrisFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vLife;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.28, 0.0, d);
    float alpha = (core * 0.9 + smoothstep(0.5, 0.12, d) * 0.35) * clamp(vLife, 0.0, 1.0);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor * (1.2 + vLife), alpha);
    #include <logdepthbuf_fragment>
  }
`;

export const sunVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const sunFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uHeat;
  varying vec3 vNormal;
  varying vec3 vWorld;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + 1.0), f.x), f.y), f.z);
  }
  void main() {
    vec3 nrm = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float n = noise(vWorld * 0.0038 + vec3(uTime * 0.16, uTime * 0.11, 0.0));
    n += 0.55 * noise(vWorld * 0.011 - vec3(0.0, uTime * 0.24, uTime * 0.09));
    n += 0.22 * noise(vWorld * 0.028 + uTime * 0.08);
    float limb = pow(max(0.0, dot(nrm, viewDir)), 0.45);
    vec3 core = mix(uColor * 0.55, vec3(1.0, 0.94, 0.78), n * 0.5 + uHeat * 0.28);
    vec3 hot = mix(core, vec3(1.0, 0.72, 0.38), uHeat * n);
    float rim = pow(1.0 - abs(dot(nrm, viewDir)), 2.2);
    vec3 flare = uColor * (0.35 + 0.65 * sin(uTime * (2.4 + uHeat * 4.0) + n * 12.0)) * uHeat * 0.35;
    gl_FragColor = vec4(hot * (0.55 + limb * 0.7) + uColor * rim * 1.05 + flare, 1.0);
    #include <logdepthbuf_fragment>
  }
`;

export const coronaFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uHeat;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.8);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.6 + vWorld.x * 0.001);
    gl_FragColor = vec4(uColor * (1.0 + uHeat * 0.4), fresnel * (0.42 + uHeat * 0.28) * pulse);
    #include <logdepthbuf_fragment>
  }
`;

export const diskVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vPos = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const diskFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vWorld;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float ring = smoothstep(0.16, 0.34, r) * (1.0 - smoothstep(0.82, 1.02, r));
    float swirl = 0.5 + 0.5 * sin(ang * 11.0 - r * 16.0 + uTime * 3.1);
    swirl *= 0.55 + 0.45 * sin(ang * 3.0 + uTime * 1.2);
    float doppler = 0.5 + 0.5 * sin(ang - uTime * 1.8);
    vec3 hot = mix(uColor, vec3(1.0, 0.86, 0.55), swirl * 0.65 + uHeat * 0.2);
    vec3 cold = mix(vec3(0.45, 0.62, 1.0), hot, 0.4);
    vec3 color = mix(cold, hot, doppler);
    float inner = exp(-pow((r - 0.28) * 8.0, 2.0)) * (0.7 + uHeat);
    gl_FragColor = vec4(color + vec3(1.0, 0.7, 0.4) * inner, ring * (0.38 + swirl * 0.48 + uHeat * 0.18));
    #include <logdepthbuf_fragment>
  }
`;

export const lensFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 4.2);
    float ring = smoothstep(0.08, 0.0, abs(fresnel - 0.55));
    vec3 color = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.82, 0.55), ring);
    gl_FragColor = vec4(color, fresnel * 0.42 + ring * 0.35);
    #include <logdepthbuf_fragment>
  }
`;

export const jetVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying float vAlong;
  varying vec3 vWorld;
  void main() {
    vAlong = position.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const jetFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vWorld;
  void main() {
    float t = clamp(vAlong * 0.5 + 0.5, 0.0, 1.0);
    float pulse = 0.55 + 0.45 * sin(uTime * 6.0 - t * 18.0 + vWorld.x * 0.0002);
    float alpha = (1.0 - t) * (0.22 + pulse * 0.2);
    gl_FragColor = vec4(uColor * (1.1 + pulse * 0.5), alpha);
    #include <logdepthbuf_fragment>
  }
`;

export const planetVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aMeta;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying vec3 vMeta;
  void main() {
    vColor = instanceColor;
    vMeta = aMeta;
    #ifdef USE_INSTANCING
      vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    #else
      vec4 world = modelMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix) * normal);
    #endif
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const planetFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform vec3 uLightA;
  uniform vec3 uLightB;
  uniform vec3 uLightC;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying vec3 vMeta;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + 1.0), f.x), f.y), f.z);
  }
  float lightAt() {
    vec3 dA = uLightA - vWorld; float a = 18.0 / (1.0 + dot(dA, dA) * 0.00000000012);
    vec3 dB = uLightB - vWorld; float b = 14.0 / (1.0 + dot(dB, dB) * 0.00000000012);
    vec3 dC = uLightC - vWorld; float c = 10.0 / (1.0 + dot(dC, dC) * 0.00000000012);
    float la = max(0.0, dot(normalize(vNormal), normalize(dA))) * a;
    float lb = max(0.0, dot(normalize(vNormal), normalize(dB))) * b;
    float lc = max(0.0, dot(normalize(vNormal), normalize(dC))) * c;
    return la + lb + lc;
  }
  void main() {
    vec3 nrm = normalize(vNormal);
    float n = noise(vWorld * 0.012 + vColor * 12.0);
    float bands = 0.5 + 0.5 * sin(nrm.y * (12.0 + vMeta.x * 16.0) + n * 3.0 + uTime * 0.04);
    vec3 rocky = mix(vColor * 0.55, vColor * 1.15, n);
    vec3 gas = mix(vColor * 0.42, mix(vColor, vec3(1.0, 0.86, 0.62), 0.35), bands);
    vec3 surface = mix(rocky, gas, clamp(vMeta.x, 0.0, 1.0));
    float caps = smoothstep(0.62, 0.92, abs(nrm.y)) * (0.35 + vMeta.z);
    surface = mix(surface, vec3(0.86, 0.93, 1.0), caps);
    float lit = 0.045 + lightAt();
    vec3 night = surface * vec3(0.07, 0.09, 0.16);
    vec3 color = mix(night, surface * lit, smoothstep(0.02, 0.8, lit));
    float rim = pow(1.0 - abs(dot(nrm, normalize(cameraPosition - vWorld))), 2.6);
    gl_FragColor = vec4(color + vColor * rim * 0.16, 1.0);
    #include <logdepthbuf_fragment>
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vColor;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.8);
    gl_FragColor = vec4(mix(vColor, vec3(0.55, 0.78, 1.0), 0.4), fresnel * 0.42);
    #include <logdepthbuf_fragment>
  }
`;

export const nebulaVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const nebulaFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + 1.0), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.13; a *= 0.52; }
    return v;
  }
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.6);
    float n = fbm(vWorld * 0.0000048 + vec3(uTime * 0.008, 0.0, uTime * 0.005));
    float veins = smoothstep(0.38, 0.72, n);
    vec3 color = mix(uColor * 0.35, uColor, veins);
    float alpha = veins * fresnel * 0.16;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
  }
`;

export const shockFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uAge;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.4);
    float fade = 1.0 - uAge;
    gl_FragColor = vec4(uColor, fresnel * fade * 0.7);
    #include <logdepthbuf_fragment>
  }
`;

export const ringVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = instanceColor;
    #ifdef USE_INSTANCING
      vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 world = modelMatrix * vec4(position, 1.0);
    #endif
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const ringFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.12, 0.28, r) * (1.0 - smoothstep(0.86, 1.0, r));
    float gaps = 0.55 + 0.45 * sin(r * 42.0 + uTime * 0.2);
    gl_FragColor = vec4(mix(vColor, vec3(0.9, 0.82, 0.62), 0.35), ring * gaps * 0.55);
    #include <logdepthbuf_fragment>
  }
`;
