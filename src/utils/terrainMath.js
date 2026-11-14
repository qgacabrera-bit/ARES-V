import * as THREE from 'three';

export const TERRAIN_SIZE = 220;
export const CHUNK_SIZE = 34;
export const CHUNK_HALF = CHUNK_SIZE * 0.5;
export const MAP_3X3_SPAN = CHUNK_SIZE * 3; // 102m (3x3 chunks)
export const MAP_3X3_RANGE = MAP_3X3_SPAN * 0.5; // 51m
const CHUNK_CACHE_RES = 65; // 64 segments -> exact shared border vertices
const PROCEDURAL_GRID_RES = 256;
const DEFAULT_ELEVATION_SCALE_METERS = 22.0;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function worldToChunk(wx, wz) {
  return [Math.round(wx / CHUNK_SIZE), Math.round(wz / CHUNK_SIZE)];
}

export function getChunkBounds(cx, cz) {
  const centerX = cx * CHUNK_SIZE;
  const centerZ = cz * CHUNK_SIZE;
  return {
    cx,
    cz,
    key: `${cx},${cz}`,
    centerX,
    centerZ,
    minX: centerX - CHUNK_HALF,
    maxX: centerX + CHUNK_HALF,
    minZ: centerZ - CHUNK_HALF,
    maxZ: centerZ + CHUNK_HALF,
  };
}

export function getActive3x3Chunks(wx, wz) {
  const [ccx, ccz] = worldToChunk(wx, wz);
  const chunks = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      chunks.push(getChunkBounds(ccx + dx, ccz + dz));
    }
  }
  return chunks;
}

// Deterministic noise & planetary/terrain math for ARES-V

function hash2D(x, z, seed = 0) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise2D(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x, z, seed = 0, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * (smoothNoise2D(x * frequency, z * frequency, seed + i * 13.37) * 2.0 - 1.0);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

export function ridgedFbm2D(x, z, seed = 0, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let weight = 1.0;

  for (let i = 0; i < octaves; i++) {
    let n = smoothNoise2D(x * frequency, z * frequency, seed + i * 29.1) * 2.0 - 1.0;
    n = 1.0 - Math.abs(n);
    n = n * n * weight;
    weight = Math.min(1.0, Math.max(0.0, n * 1.6));
    value += n * amplitude;
    frequency *= 2.12;
    amplitude *= 0.5;
  }
  return value;
}

// Deterministic crater synthesis around the exploration zone
const CRATER_SEEDS = [
  { x: 26, z: -28, r: 11, depth: 2.1 },
  { x: -29, z: -25, r: 9.5, depth: 1.7 },
  { x: 34, z: 19, r: 14, depth: 2.6 },
  { x: -24, z: 27, r: 8.5, depth: 1.4 },
  { x: -46, z: -6, r: 16, depth: 3.1 },
  { x: 10, z: -48, r: 13, depth: 2.3 },
];

function craterContribution(x, z, craterDensity = 1.0) {
  let h = 0;
  for (let i = 0; i < CRATER_SEEDS.length; i++) {
    const c = CRATER_SEEDS[i];
    const dx = x - c.x;
    const dz = z - c.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const norm = dist / c.r;

    if (norm < 1.55) {
      if (norm < 1.0) {
        const bowl = (norm * norm - 1.0) * c.depth;
        h += bowl * craterDensity;
      } else {
        const t = (norm - 1.0) / 0.55;
        const rim = Math.exp(-t * t * 4.5) * c.depth * 0.28;
        h += rim * craterDensity;
      }
    }
  }
  return h;
}

function proceduralCellCraters(x, z, craterDensity = 1.0, seed = 17.3) {
  const cellSize = 36;
  const gcx = Math.floor(x / cellSize);
  const gcz = Math.floor(z / cellSize);
  let h = 0;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = gcx + dx;
      const iz = gcz + dz;
      // Skip immediate origin cell where CRATER_SEEDS already shapes local terrain
      if (Math.abs(ix) <= 1 && Math.abs(iz) <= 1) continue;

      const p = hash2D(ix, iz, seed + 13.7);
      if (p > 0.44 * Math.min(1.4, craterDensity)) continue;

      const cx = (ix + 0.2 + 0.6 * hash2D(ix, iz, seed + 41.2)) * cellSize;
      const cz = (iz + 0.2 + 0.6 * hash2D(ix, iz, seed + 79.4)) * cellSize;
      const r = 6.5 + hash2D(ix, iz, seed + 105.9) * 9.5;
      const depth = 1.1 + (r / 16.0) * 1.9;

      const d = Math.hypot(x - cx, z - cz);
      const norm = d / r;
      if (norm < 1.55) {
        if (norm < 1.0) {
          h += (norm * norm - 1.0) * depth * craterDensity;
        } else {
          const t = (norm - 1.0) / 0.55;
          h += Math.exp(-t * t * 4.5) * depth * 0.28 * craterDensity;
        }
      }
    }
  }
  return h;
}

/**
 * Multi-octave ridged/crater procedural terrain height fallback at world (x, z).
 */
export function computeProceduralHeight(x, z, siteProfile) {
  const {
    seed = 17.3,
    roughness = 1.15,
    ridgeSharpness = 1.3,
    craterDensity = 0.9,
  } = siteProfile || {};

  const broad = fbm2D(x * 0.022, z * 0.022, seed, 4) * 4.4 * roughness;
  const ridges = (ridgedFbm2D(x * 0.042, z * 0.042, seed + 51.2, 4) - 0.55) * 3.8 * ridgeSharpness;
  const micro = fbm2D(x * 0.16, z * 0.16, seed + 99.4, 3) * 0.35 * roughness;

  const raw = broad + ridges + micro;
  const terraceStep = 0.85;
  const terraced = raw + Math.sin(raw * ((Math.PI * 2) / terraceStep)) * 0.08 * ridgeSharpness;

  const distFromSpawn = Math.sqrt(x * x + z * z);
  const distFromLander = Math.sqrt(x * x + (z - 8) * (z - 8));
  const rimRise = Math.min(4.8, Math.max(0, (distFromSpawn - 38) * 0.12)) * roughness;
  const craters =
    craterContribution(x, z, craterDensity) +
    proceduralCellCraters(x, z, craterDensity, seed);

  const total = terraced + craters + rimRise;

  // Smooth landing pad flatten around astronaut spawn (0, 0) and Mars Lander (0, 8)
  const padDist = Math.min(distFromSpawn, distFromLander * 0.85);
  const landingBlend = Math.min(1.0, Math.max(0.0, (padDist - 4.2) / 5.8));
  const smoothBlend = landingBlend * landingBlend * (3.0 - 2.0 * landingBlend);

  return total * smoothBlend;
}

// Active heightmap cache (supports both HiRISE PNGs and procedural Float32Array fallback)
let activeHeightmap = null;
const zoneAssetCache = new Map();

function buildProceduralHeightGrid(zoneId, siteProfile) {
  const width = PROCEDURAL_GRID_RES;
  const height = PROCEDURAL_GRID_RES;
  const grid = new Float32Array(width * height);
  const half = TERRAIN_SIZE * 0.5;

  for (let row = 0; row < height; row++) {
    const z = (row / (height - 1)) * TERRAIN_SIZE - half;
    for (let col = 0; col < width; col++) {
      const x = (col / (width - 1)) * TERRAIN_SIZE - half;
      grid[row * width + col] = computeProceduralHeight(x, z, siteProfile);
    }
  }

  return {
    zoneId,
    seed: siteProfile?.seed ?? 17.3,
    width,
    height,
    grid,
    mode: 'PROCEDURAL',
    albedoTexture: null,
  };
}

async function fetchImageAsset(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) return null;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to decode ${url}`));
      image.src = objectUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchTerrainMeta(zoneId) {
  try {
    const res = await fetch(`/terrain/${zoneId}/meta.json`);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Loads site-specific HiRISE DTM heightmap PNG & orthophoto JPG from `/terrain/{zoneId}/`
 * into an interpolated Float32Array grid, with automatic procedural fallback if unavailable.
 */
export async function loadHiRiseTerrainAssets(zoneId, siteProfile) {
  if (zoneAssetCache.has(zoneId)) {
    const cached = zoneAssetCache.get(zoneId);
    activeHeightmap = cached;
    return cached;
  }

  // Immediately prime procedural heightmap so synchronous frame 0 queries never stutter
  const proceduralFallback = buildProceduralHeightGrid(zoneId, siteProfile);
  activeHeightmap = proceduralFallback;

  try {
    const [meta, heightImg, albedoImg] = await Promise.all([
      fetchTerrainMeta(zoneId),
      fetchImageAsset(`/terrain/${zoneId}/heightmap.png`),
      fetchImageAsset(`/terrain/${zoneId}/albedo.jpg`).catch(() => null),
    ]);

    if (!heightImg) {
      zoneAssetCache.set(zoneId, proceduralFallback);
      activeHeightmap = proceduralFallback;
      return proceduralFallback;
    }

    const width = heightImg.naturalWidth || heightImg.width;
    const height = heightImg.naturalHeight || heightImg.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(heightImg, 0, 0, width, height);

    const { data } = ctx.getImageData(0, 0, width, height);
    const elevationScaleMeters = Number(meta?.elevationScaleMeters) || DEFAULT_ELEVATION_SCALE_METERS;

    // Sample center pixel luminance so spawn point (0, 0) rests near y = 0
    const centerRow = Math.floor(height / 2);
    const centerCol = Math.floor(width / 2);
    const cIdx = (centerRow * width + centerCol) * 4;
    const centerLum = (data[cIdx] * 0.299 + data[cIdx + 1] * 0.587 + data[cIdx + 2] * 0.114) / 255.0;

    const grid = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      const lum = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255.0;
      grid[i] = (lum - centerLum) * elevationScaleMeters;
    }

    let albedoTexture = null;
    if (albedoImg) {
      const albedoCanvas = document.createElement('canvas');
      albedoCanvas.width = albedoImg.naturalWidth || albedoImg.width;
      albedoCanvas.height = albedoImg.naturalHeight || albedoImg.height;
      albedoCanvas.getContext('2d').drawImage(albedoImg, 0, 0);
      albedoTexture = new THREE.CanvasTexture(albedoCanvas);
      albedoTexture.colorSpace = THREE.SRGBColorSpace;
      albedoTexture.wrapS = THREE.ClampToEdgeWrapping;
      albedoTexture.wrapT = THREE.ClampToEdgeWrapping;
      albedoTexture.needsUpdate = true;
    }

    const asset = {
      zoneId,
      seed: siteProfile?.seed ?? 17.3,
      width,
      height,
      grid,
      mode: 'HIRISE',
      albedoTexture,
    };

    zoneAssetCache.set(zoneId, asset);
    activeHeightmap = asset;
    return asset;
  } catch {
    zoneAssetCache.set(zoneId, proceduralFallback);
    activeHeightmap = proceduralFallback;
    return proceduralFallback;
  }
}

const chunkHeightCache = new Map();

function sampleHiRiseGridAt(x, z) {
  const { width, height, grid } = activeHeightmap;
  const half = TERRAIN_SIZE * 0.5;
  const u = Math.min(1, Math.max(0, (x + half) / TERRAIN_SIZE));
  const v = Math.min(1, Math.max(0, (z + half) / TERRAIN_SIZE));

  const gx = u * (width - 1);
  const gz = v * (height - 1);

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(width - 1, x0 + 1);
  const z1 = Math.min(height - 1, z0 + 1);

  const tx = gx - x0;
  const tz = gz - z0;

  const h00 = grid[z0 * width + x0];
  const h10 = grid[z0 * width + x1];
  const h01 = grid[z1 * width + x0];
  const h11 = grid[z1 * width + x1];

  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return h0 + (h1 - h0) * tz;
}

function getOrBuildChunkHeightGrid(cx, cz, siteProfile) {
  const seed = siteProfile?.seed ?? 17.3;
  const modeTag = activeHeightmap?.mode === 'HIRISE' && activeHeightmap?.seed === seed ? 'H' : 'P';
  const cacheKey = `${seed}:${modeTag}:${cx},${cz}`;
  if (chunkHeightCache.has(cacheKey)) {
    return chunkHeightCache.get(cacheKey);
  }

  const res = CHUNK_CACHE_RES;
  const grid = new Float32Array(res * res);
  const bounds = getChunkBounds(cx, cz);
  const half = TERRAIN_SIZE * 0.5;

  for (let row = 0; row < res; row++) {
    const wz = bounds.minZ + (row / (res - 1)) * CHUNK_SIZE;
    for (let col = 0; col < res; col++) {
      const wx = bounds.minX + (col / (res - 1)) * CHUNK_SIZE;
      const procH = computeProceduralHeight(wx, wz, siteProfile);

      if (modeTag === 'H' && Math.abs(wx) <= half && Math.abs(wz) <= half) {
        const hiriseH = sampleHiRiseGridAt(wx, wz);
        const edgeDist = Math.max(Math.abs(wx), Math.abs(wz));
        const blend = edgeDist <= 90 ? 0 : Math.min(1, (edgeDist - 90) / (half - 90));
        grid[row * res + col] = hiriseH + (procH - hiriseH) * blend;
      } else {
        grid[row * res + col] = procH;
      }
    }
  }

  chunkHeightCache.set(cacheKey, grid);
  return grid;
}

/**
 * Bilinear interpolation lookup inside the cached 34m chunk grid (works seamlessly across infinite chunks).
 */
export function getTerrainHeightAt(x, z, siteProfile) {
  const expectedSeed = siteProfile?.seed;
  if (!activeHeightmap || (expectedSeed !== undefined && activeHeightmap.seed !== expectedSeed)) {
    activeHeightmap = buildProceduralHeightGrid('active', siteProfile);
  }

  const [cx, cz] = worldToChunk(x, z);
  const bounds = getChunkBounds(cx, cz);
  const grid = getOrBuildChunkHeightGrid(cx, cz, siteProfile);
  const res = CHUNK_CACHE_RES;

  const u = Math.min(1, Math.max(0, (x - bounds.minX) / CHUNK_SIZE));
  const v = Math.min(1, Math.max(0, (z - bounds.minZ) / CHUNK_SIZE));

  const gx = u * (res - 1);
  const gz = v * (res - 1);

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(res - 1, x0 + 1);
  const z1 = Math.min(res - 1, z0 + 1);

  const tx = gx - x0;
  const tz = gz - z0;

  const h00 = grid[z0 * res + x0];
  const h10 = grid[z0 * res + x1];
  const h01 = grid[z1 * res + x0];
  const h11 = grid[z1 * res + x1];

  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;

  return h0 + (h1 - h0) * tz;
}

// Backwards-compatible alias
export const getTerrainHeight = getTerrainHeightAt;

/**
 * Finite-difference normal [nx, ny, nz] and slope angle (degrees) via Math.acos(normal.y) * RAD2DEG.
 */
export function getTerrainSlopeAndNormal(x, z, siteProfile) {
  const eps = 0.65;
  const hL = getTerrainHeightAt(x - eps, z, siteProfile);
  const hR = getTerrainHeightAt(x + eps, z, siteProfile);
  const hD = getTerrainHeightAt(x, z - eps, siteProfile);
  const hU = getTerrainHeightAt(x, z + eps, siteProfile);

  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);

  const len = Math.sqrt(dx * dx + 1.0 + dz * dz);
  const nx = -dx / len;
  const ny = 1.0 / len;
  const nz = -dz / len;

  const slopeRad = Math.acos(Math.min(1.0, Math.max(-1.0, ny)));
  const slopeDeg = slopeRad * RAD2DEG;

  return {
    slopeDeg,
    normal: [nx, ny, nz],
  };
}

/**
 * Computes normalized CRISM spectral intensities { clay, sulfate, carbonate } at (x, z).
 */
export function getSpectralSignature(x, z, siteProfile, targets = []) {
  const seed = siteProfile?.seed || 17.3;

  let clay = Math.max(0, fbm2D(x * 0.045, z * 0.045, seed + 201, 3) * 0.8 + 0.25);
  let sulfate = Math.max(0, fbm2D(x * 0.055, z * 0.055, seed + 307, 3) * 0.8 + 0.18);
  let carbonate = Math.max(0, fbm2D(x * 0.05, z * 0.05, seed + 419, 3) * 0.75 + 0.12);

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = x - t.position[0];
    const dz = z - t.position[1];
    const d2 = dx * dx + dz * dz;
    const boost = Math.exp(-d2 / 55.0) * 0.95;

    if (t.dominantMineral === 'clay') clay = Math.min(1, clay + boost);
    else if (t.dominantMineral === 'sulfate') sulfate = Math.min(1, sulfate + boost);
    else carbonate = Math.min(1, carbonate + boost);
  }

  return {
    clay: Math.min(1, clay),
    sulfate: Math.min(1, sulfate),
    carbonate: Math.min(1, carbonate),
  };
}

/**
 * Local RAD radiation dose rate in mSv/d based on site baseline, elevation, and spatial anomalies.
 */
export function getLocalRadiation(x, z, height, slopeDeg, baseRad = 0.64) {
  const spatialAnomaly = Math.max(0, fbm2D(x * 0.04, z * 0.04, 713, 2)) * 0.14;
  const elevationTerm = Math.max(-0.04, Math.min(0.12, height * 0.012));
  const exposureTerm = Math.max(0, (slopeDeg - 15) * 0.0025);
  return Number((baseRad + spatialAnomaly + elevationTerm + exposureTerm).toFixed(2));
}

/**
 * Standard spherical-to-Cartesian conversion matching Three.js SphereGeometry equirectangular UV layout.
 * Accepts East-positive longitude degrees (e.g. 192.0°E -> -168.0°).
 */
export function latLonToVector3(lat, lon, radius = 2.0) {
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const phi = (90 - lat) * DEG2RAD;
  const theta = (normLon + 180) * DEG2RAD;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return [x, y, z];
}
