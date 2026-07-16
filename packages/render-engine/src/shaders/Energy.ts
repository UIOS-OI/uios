export const energyVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  uniform float uInteraction;
  uniform float uIgnition;
  attribute float aScale;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    transformed.y += sin(uTime * 0.75 + position.x * 1.6) * 0.08;
    transformed *= smoothstep(0.04, 1.0, uIgnition);
    float pointerField = exp(-length(transformed.xy - uPointer * 2.8) * 0.5);
    transformed.xy += normalize(transformed.xy - uPointer * 2.8 + vec2(0.001)) * pointerField * uInteraction * 0.22;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aScale * uPixelRatio * (1400.0 / -viewPosition.z), 1.0, 12.0);
    vAlpha = (0.35 + 0.35 * sin(uTime * 1.7 + aScale * 2.1) + pointerField * uInteraction * 0.55) * uIgnition;
  }
`;

export const energyFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    float glow = smoothstep(0.5, 0.0, distanceToCenter);
    gl_FragColor = vec4(uColor, glow * vAlpha);
  }
`;
