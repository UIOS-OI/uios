export const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const backgroundFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.0, 0.78, length(uv));
    float stars = step(0.996, hash(floor(vUv * 240.0)));
    float drift = 0.5 + 0.5 * sin(uTime * 0.08 + uv.x * 4.0 - uv.y * 3.0);
    vec3 voidColor = vec3(0.002, 0.004, 0.018);
    vec3 fieldColor = vec3(0.018, 0.035, 0.11) * radial * (0.65 + drift * 0.35);
    gl_FragColor = vec4(voidColor + fieldColor + stars * 0.55, 1.0);
  }
`;
