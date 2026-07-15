export const energyVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aScale;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    transformed.y += sin(uTime * 0.75 + position.x * 1.6) * 0.08;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aScale * uPixelRatio * (20.0 / -viewPosition.z);
    vAlpha = 0.45 + 0.45 * sin(uTime * 1.7 + aScale * 2.1);
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
