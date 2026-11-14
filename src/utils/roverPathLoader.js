import { LANDING_ZONES_BY_ID } from '../data/landingZones';

const MMGIS_TRAVERSE_URLS = {
  jezero: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json',
  gale: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json',
};

const traverseCache = new Map();
const inflightRequests = new Map();

let albedoImg = null;
let albedoLoaded = false;
let albedoPromise = null;
const albedoSubscribers = new Set();

/**
 * Computes safe clamped equirectangular crop bounds [u0, v0, uSpan, vSpan]
 * strictly within [0, 1] inside `/textures/mars_albedo.jpg` centered around (lat, lon)
 * or the official NASA Mars Trek bookmark extent [minLon, minLat, maxLon, maxLat].
 */
export function getMarsAlbedoCrop(lat, lon, uSpan = 0.12, vSpan = 0.24, bookmarkExtent = null) {
  const hasExtent = Array.isArray(bookmarkExtent) && bookmarkExtent.length === 4;
  const effLon = hasExtent ? (bookmarkExtent[0] + bookmarkExtent[2]) * 0.5 : lon;
  const effLat = hasExtent ? (bookmarkExtent[1] + bookmarkExtent[3]) * 0.5 : lat;

  const normLon = ((((effLon + 180) % 360) + 360) % 360) - 180;
  const centerU = (normLon + 180) / 360;
  const centerV = (90 - effLat) / 180;

  const u0 = Math.max(0, Math.min(1 - uSpan, centerU - uSpan * 0.5));
  const v0 = Math.max(0, Math.min(1 - vSpan, centerV - vSpan * 0.5));

  return {
    u0,
    v0,
    uSpan,
    vSpan,
    centerLon: effLon,
    centerLat: effLat,
    bookmarkExtent: hasExtent ? bookmarkExtent : null,
  };
}

/**
 * Loads `/textures/mars_albedo.jpg` once into a shared HTMLImageElement
 * so 2D canvas components can paint the NASA Mars albedo background directly.
 */
export function loadMarsAlbedoImage(onReady) {
  if (albedoLoaded && albedoImg) {
    if (onReady) onReady(albedoImg);
    return Promise.resolve(albedoImg);
  }

  if (onReady) {
    albedoSubscribers.add(onReady);
  }

  if (albedoPromise) return albedoPromise;

  albedoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      albedoImg = img;
      albedoLoaded = true;
      albedoSubscribers.forEach((cb) => {
        try {
          cb(img);
        } catch {
          // Ignore stale listener
        }
      });
      albedoSubscribers.clear();
      resolve(img);
    };
    img.onerror = () => {
      albedoSubscribers.clear();
      resolve(null);
    };
    img.src = '/textures/mars_albedo.jpg';
  });

  return albedoPromise;
}

export function getCachedMarsAlbedoImage() {
  return albedoLoaded ? albedoImg : null;
}

function extractGeoJsonVertices(fc) {
  const pts = [];
  const features = fc?.features || [];
  let latestSol = null;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (f?.properties?.sol != null) {
      latestSol = Math.max(latestSol ?? 0, Number(f.properties.sol));
    }
    const geom = f?.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      for (let j = 0; j < geom.coordinates.length; j++) {
        const c = geom.coordinates[j];
        if (c.length >= 2) pts.push([c[0], c[1]]);
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (let k = 0; k < geom.coordinates.length; k++) {
        const line = geom.coordinates[k];
        for (let j = 0; j < line.length; j++) {
          const c = line[j];
          if (c.length >= 2) pts.push([c[0], c[1]]);
        }
      }
    }
  }

  return { pts, featureCount: features.length, latestSol };
}

function decimateCoords(pts, maxPts = 38) {
  if (pts.length <= maxPts) return pts;
  const cum = new Float64Array(pts.length);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum[i] = total;
  }
  if (total < 1e-9) return [pts[0], pts[pts.length - 1]];
  const out = [[Number(pts[0][0].toFixed(5)), Number(pts[0][1].toFixed(5))]];
  let cursor = 1;
  for (let k = 1; k < maxPts - 1; k++) {
    const target = (k / (maxPts - 1)) * total;
    while (cursor < pts.length - 1 && cum[cursor] < target) cursor++;
    out.push([Number(pts[cursor][0].toFixed(5)), Number(pts[cursor][1].toFixed(5))]);
  }
  const last = pts[pts.length - 1];
  out.push([Number(last[0].toFixed(5)), Number(last[1].toFixed(5))]);
  return out;
}

export const MARS_TRAVERSE_SCALE_M_PER_KM = 2.0;

/**
 * Projects decimated real Mars GeoJSON [lon, lat] points isotropically into scene meters,
 * anchored at the rover's landingPosition (Sol 0) with path arc length strictly proportional
 * (MARS_TRAVERSE_SCALE_M_PER_KM = 2.0m per km) to official NASA odometry.
 */
export function normalizeLonLatToLocal(geoPts, landingPos, roverPos, totalOdometryKm = null) {
  if (!geoPts || geoPts.length < 2) return [landingPos, roverPos];

  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < geoPts.length; i++) {
    const lat = geoPts[i][1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const cosLat = Math.cos(((minLat + maxLat) * 0.5 * Math.PI) / 180);
  const [startLon, startLat] = geoPts[0];
  const offsetsKm = geoPts.map(([lon, lat]) => [
    (lon - startLon) * cosLat * 59.27,
    -(lat - startLat) * 59.27, // North is negative Z
  ]);

  let polyKm = 0;
  for (let i = 1; i < offsetsKm.length; i++) {
    polyKm += Math.hypot(
      offsetsKm[i][0] - offsetsKm[i - 1][0],
      offsetsKm[i][1] - offsetsKm[i - 1][1]
    );
  }

  const targetArcMeters = (totalOdometryKm || polyKm) * MARS_TRAVERSE_SCALE_M_PER_KM;
  const scale = targetArcMeters / Math.max(1e-4, polyKm);

  return offsetsKm.map(([kx, kz]) => [
    Number((landingPos[0] + kx * scale).toFixed(2)),
    Number((landingPos[1] + kz * scale).toFixed(2)),
  ]);
}

/**
 * Fetches live NASA MMGIS GeoJSON traverse data for Perseverance (M20) or Curiosity (MSL).
 * Automatically caches results and falls back to bundled NASA waypoint data on offline/CORS errors.
 */
export async function fetchLiveRoverTraverse(siteId) {
  if (traverseCache.has(siteId)) {
    return traverseCache.get(siteId);
  }
  if (inflightRequests.has(siteId)) {
    return inflightRequests.get(siteId);
  }

  const site = LANDING_ZONES_BY_ID[siteId] || LANDING_ZONES_BY_ID.jezero;
  const rover = site?.nasaRover;
  const fallback = {
    status: 'CACHED',
    points: rover?.traversePoints || [],
    geoJsonLonLat: rover?.realGeoJsonLonLat || [],
    latestSol: rover?.latestSol || null,
    totalOdometryKm: rover?.totalOdometryKm || null,
  };

  const url = MMGIS_TRAVERSE_URLS[siteId];
  if (!url || !rover) {
    traverseCache.set(siteId, fallback);
    return fallback;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const { pts, featureCount, latestSol } = extractGeoJsonVertices(json);
      if (pts.length < 2) throw new Error('Empty traverse geometry');

      const decimated = decimateCoords(pts, 38);
      const localPts = normalizeLonLatToLocal(
        decimated,
        rover.landingPosition || rover.traversePoints[0],
        rover.position,
        rover.totalOdometryKm
      );

      const liveResult = {
        status: 'LIVE',
        points: localPts,
        geoJsonLonLat: decimated,
        featureCount,
        latestSol: latestSol || rover.latestSol,
        totalOdometryKm: rover.totalOdometryKm,
      };
      traverseCache.set(siteId, liveResult);
      return liveResult;
    } catch {
      clearTimeout(timer);
      traverseCache.set(siteId, fallback);
      return fallback;
    } finally {
      inflightRequests.delete(siteId);
    }
  })();

  inflightRequests.set(siteId, promise);
  return promise;
}
