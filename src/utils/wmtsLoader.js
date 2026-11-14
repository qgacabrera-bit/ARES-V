import * as THREE from 'three';

const LOCAL_ALBEDO_URL = '/textures/mars_albedo.jpg';
const LOCAL_BUMP_URL = '/textures/mars_bump.jpg';

const REMOTE_ALBEDO_FALLBACKS = [
  'https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg',
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_1k_color.jpg',
];

const REMOTE_BUMP_FALLBACKS = [
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_1k_topo.jpg',
];

const WMTS_ZOOM = 2;
const COLS = 8;
const ROWS = 4;
const TILE_SIZE = 256;
const TILE_TIMEOUT_MS = 7000;

const VIKING_WMTS_URL =
  'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';
const MOLA_WMTS_URL =
  'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';

let cachedResult = null;
let inflightPromise = null;

function loadViaTextureLoader(url, isSRGB) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const timer = setTimeout(() => {
      reject(new Error(`Texture load timeout: ${url}`));
    }, TILE_TIMEOUT_MS);

    loader.load(
      url,
      (texture) => {
        clearTimeout(timer);
        texture.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => {
        clearTimeout(timer);
        reject(new Error(`Texture load error: ${url}`));
      }
    );
  });
}

function loadSingleTile(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      img.src = '';
      reject(new Error('WMTS tile timeout'));
    }, TILE_TIMEOUT_MS);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(img);
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('WMTS tile error'));
    };

    img.src = url;
  });
}

async function stitchWmtsCanvasTexture(templateUrl, isSRGB) {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d');

  const jobs = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const url = templateUrl
        .replace('{z}', String(WMTS_ZOOM))
        .replace('{y}', String(y))
        .replace('{x}', String(x));
      jobs.push(loadSingleTile(url).then((img) => ({ x, y, img })));
    }
  }

  const tiles = await Promise.all(jobs);
  for (let i = 0; i < tiles.length; i++) {
    const { x, y, img } = tiles[i];
    ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

async function loadFirstAvailable(urls, isSRGB) {
  for (let i = 0; i < urls.length; i++) {
    try {
      return await loadViaTextureLoader(urls[i], isSRGB);
    } catch {
      // Try next URL in fallback chain
    }
  }
  return null;
}

/**
 * Loads NASA Mars global albedo & MOLA elevation/bump textures.
 * 1) Checks local `/textures/mars_albedo.jpg` & `/textures/mars_bump.jpg` first.
 * 2) Falls back to CORS-enabled NASA/Wikimedia equirectangular maps or live Mars Trek WMTS tiles.
 * 3) Resolves `{ status: 'ACTIVE', textures: { albedo, bump } }` or silent `'SYNTHETIC'` fallback.
 */
export async function loadMarsWmtsTextures() {
  if (cachedResult) return cachedResult;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const [localAlbedo, localBump] = await Promise.all([
        loadFirstAvailable([LOCAL_ALBEDO_URL, ...REMOTE_ALBEDO_FALLBACKS], true),
        loadFirstAvailable([LOCAL_BUMP_URL, ...REMOTE_BUMP_FALLBACKS], false),
      ]);

      const albedo =
        localAlbedo || (await stitchWmtsCanvasTexture(VIKING_WMTS_URL, true).catch(() => null));
      const bump =
        localBump || (await stitchWmtsCanvasTexture(MOLA_WMTS_URL, false).catch(() => null));

      if (albedo && bump) {
        cachedResult = {
          status: 'ACTIVE',
          textures: { albedo, bump },
        };
        return cachedResult;
      }

      if (albedo) {
        cachedResult = {
          status: 'ACTIVE',
          textures: { albedo, bump: albedo },
        };
        return cachedResult;
      }

      cachedResult = { status: 'SYNTHETIC', textures: null };
      return cachedResult;
    } catch {
      cachedResult = { status: 'SYNTHETIC', textures: null };
      return cachedResult;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

export function createPlaceholderTexture() {
  const data = new Uint8Array([165, 92, 62, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
