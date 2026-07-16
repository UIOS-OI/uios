export const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
  }
`;

export const backgroundFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  uniform float uTimeOfDay;
  uniform vec3 uEnvironmentA;
  uniform vec3 uEnvironmentB;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.0, 0.86, length(uv));
    vec2 starGrid = vUv * 180.0;
    vec2 starCell = fract(starGrid) - 0.5;
    float starSeed = step(0.993, hash(floor(starGrid)));
    float stars = starSeed * smoothstep(0.13, 0.01, length(starCell));
    float drift = 0.5 + 0.5 * sin(uTime * 0.08 + uv.x * 4.0 - uv.y * 3.0);
    float nebula = 0.5 + 0.5 * sin(uv.x * 7.0 + sin(uv.y * 5.0 + uTime * 0.025) * 2.2);
    nebula *= 0.45 + 0.55 * (0.5 + 0.5 * sin(uv.y * 9.0 - uv.x * 3.0));
    vec3 nightVoid = mix(vec3(0.008, 0.015, 0.04), uEnvironmentA, 0.45);
    vec3 dayVoid = mix(vec3(0.018, 0.042, 0.095), uEnvironmentA, 0.32);
    vec3 duskTint = vec3(0.028, 0.008, 0.045);
    vec3 voidColor = mix(nightVoid, dayVoid, uTimeOfDay);
    voidColor += duskTint * (1.0 - abs(uTimeOfDay - 0.45) * 2.0) * 0.28;
    vec3 fieldColor = mix(vec3(0.025, 0.055, 0.14), uEnvironmentB, 0.56 + uTimeOfDay * 0.1) * radial * (0.32 + drift * 0.16 + uActivity * 0.18);
    vec3 atmosphere = mix(uEnvironmentA, uEnvironmentB, nebula) * nebula * 0.055;
    gl_FragColor = vec4(voidColor + fieldColor + atmosphere + stars * (0.78 + uActivity * 0.35), 1.0);
  }
`;
