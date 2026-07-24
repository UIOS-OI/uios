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

// ── Planet texture system ─────────────────────────────────────────────────────

/** System IDs that have hi-def planet textures in /textures/planets/ */
export const PLANET_TEXTURE_SYSTEMS = [
  "memory",
  "aegis",
  "router",
  "agents",
  "observatory",
  "forge",
  "marketplace",
] as const;

export type PlanetTextureSystem = (typeof PLANET_TEXTURE_SYSTEMS)[number];

const planetTextureCache = new Map<string, THREE.Texture>();
const planetTextureLoading = new Map<string, Promise<THREE.Texture>>();
const textureLoader = new THREE.TextureLoader();

/**
 * Returns the URL for a planet texture given a system ID.
 * Returns null if the system doesn't have a hi-def texture.
 */
export function planetTextureUrl(systemId: string): string | null {
  if (!(PLANET_TEXTURE_SYSTEMS as readonly string[]).includes(systemId)) return null;
  return `/textures/planets/${systemId}.png`;
}

/**
 * Synchronously returns a cached planet texture, or null if not yet loaded.
 * Kicks off loading in the background if not already in progress.
 */
export function getPlanetTexture(systemId: string): THREE.Texture | null {
  const cached = planetTextureCache.get(systemId);
  if (cached) return cached;

  // Start loading if not already in progress
  if (!planetTextureLoading.has(systemId)) {
    const url = planetTextureUrl(systemId);
    if (!url) return null;
    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          optimizeTexture(texture, {
            colorSpace: THREE.SRGBColorSpace,
            maxAnisotropy: 8,
            useMipmaps: true,
          });
          planetTextureCache.set(systemId, texture);
          resolve(texture);
        },
        undefined,
        reject,
      );
    });
    planetTextureLoading.set(systemId, promise);
  }

  return null;
}

/**
 * Async version — resolves when the texture is loaded and cached.
 */
export async function loadPlanetTexture(systemId: string): Promise<THREE.Texture | null> {
  const cached = planetTextureCache.get(systemId);
  if (cached) return cached;

  // Trigger loading
  getPlanetTexture(systemId);
  const promise = planetTextureLoading.get(systemId);
  if (!promise) return null;

  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Preload all planet textures in the background.
 * Call once on scene mount for smooth transitions.
 */
export function preloadAllPlanetTextures(): void {
  for (const systemId of PLANET_TEXTURE_SYSTEMS) {
    getPlanetTexture(systemId);
  }
}
