import * as THREE from "three";

export type TextureOptimizationOptions = {
  colorSpace?: THREE.ColorSpace;
  maxAnisotropy?: number;
  useMipmaps?: boolean;
};

export function optimizeTexture(
  texture: THREE.Texture,
  {
    colorSpace = THREE.NoColorSpace,
    maxAnisotropy = 1,
    useMipmaps = false,
  }: TextureOptimizationOptions = {},
) {
  texture.colorSpace = colorSpace;
  texture.anisotropy = Math.max(1, Math.floor(maxAnisotropy));
  texture.generateMipmaps = useMipmaps;
  texture.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function noiseByte(index: number) {
  let value = (index + 1) * 0x9e3779b1;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return value & 255;
}

export function createNoiseTexture(size = 64) {
  const dimension = Math.max(8, Math.floor(size));
  const data = new Uint8Array(dimension * dimension);
  for (let index = 0; index < data.length; index += 1) data[index] = noiseByte(index);

  const texture = new THREE.DataTexture(
    data,
    dimension,
    dimension,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  optimizeTexture(texture);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
