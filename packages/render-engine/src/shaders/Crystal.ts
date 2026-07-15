export const crystalVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    float displacement = sin(position.y * 5.0 + uTime * 1.8) * 0.035 * uEnergy;
    vec3 transformed = position + normal * displacement;
    vPosition = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const crystalFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4);
    float bands = 0.5 + 0.5 * sin(vPosition.y * 9.0 - uTime * 2.2);
    vec3 color = mix(uColorA, uColorB, bands * 0.45 + fresnel * 0.55);
    float alpha = 0.72 + fresnel * 0.28 * uEnergy;
    gl_FragColor = vec4(color * (0.75 + fresnel * 1.45), alpha);
  }
`;
