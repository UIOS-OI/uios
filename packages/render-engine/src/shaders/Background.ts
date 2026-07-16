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
    float starHash = hash(floor(starGrid));
    float starSeed = step(0.993, starHash);
    float stars = starSeed * smoothstep(0.13, 0.008, length(starCell));
    vec2 fineGrid = vUv * 410.0;
    vec2 fineCell = fract(fineGrid) - 0.5;
    float fineHash = hash(floor(fineGrid) + 71.0);
    float fineStars = step(0.9975, fineHash) * smoothstep(0.09, 0.006, length(fineCell));
    float twinkle = 0.78 + 0.22 * sin(uTime * (0.35 + starHash * 1.4) + starHash * 31.0);
    vec3 starTemperature = mix(vec3(0.64, 0.78, 1.0), vec3(1.0, 0.78, 0.56), smoothstep(0.2, 0.9, starHash));
    float drift = 0.5 + 0.5 * sin(uTime * 0.08 + uv.x * 4.0 - uv.y * 3.0);
    float nebula = 0.5 + 0.5 * sin(uv.x * 7.0 + sin(uv.y * 5.0 + uTime * 0.025) * 2.2);
    nebula *= 0.45 + 0.55 * (0.5 + 0.5 * sin(uv.y * 9.0 - uv.x * 3.0));
    vec3 nightVoid = mix(vec3(0.008, 0.015, 0.04), uEnvironmentA, 0.45);
    vec3 dayVoid = mix(vec3(0.018, 0.042, 0.095), uEnvironmentA, 0.32);
    vec3 duskTint = vec3(0.028, 0.008, 0.045);
    vec3 voidColor = mix(nightVoid, dayVoid, uTimeOfDay);
    voidColor += duskTint * (1.0 - abs(uTimeOfDay - 0.45) * 2.0) * 0.28;
    float galacticPlane = exp(-abs(uv.y + uv.x * 0.28 - 0.04) * 7.5);
    vec3 fieldColor = mix(vec3(0.018, 0.04, 0.105), uEnvironmentB, 0.44 + uTimeOfDay * 0.08) * radial * (0.24 + drift * 0.13 + uActivity * 0.16);
    vec3 atmosphere = mix(uEnvironmentA, uEnvironmentB, nebula) * nebula * 0.042;
    vec3 milkyWay = mix(vec3(0.15, 0.19, 0.28), uEnvironmentB * 0.45, nebula) * galacticPlane * (0.055 + nebula * 0.09);
    vec3 stellarField = starTemperature * stars * twinkle * (0.9 + uActivity * 0.28) + vec3(0.68, 0.8, 1.0) * fineStars * 0.58;
    gl_FragColor = vec4(voidColor + fieldColor + atmosphere + milkyWay + stellarField, 1.0);
  }
`;
