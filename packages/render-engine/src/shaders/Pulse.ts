export const pulseVertexShader = /* glsl */ `
  attribute float aProgress;
  varying float vProgress;

  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const pulseFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vProgress;

  void main() {
    float wave = smoothstep(0.16, 0.0, abs(fract(vProgress - uTime * 0.22) - 0.5));
    float base = 0.12 + wave * 0.88;
    gl_FragColor = vec4(uColor * (0.8 + wave), base * uOpacity);
  }
`;
