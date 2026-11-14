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

function decimateCoords(pts, maxPts = 36) {
  if (pts.length <= maxPts) return pts;
  const out = [];
  const step = (pts.length - 1) / (maxPts - 1);
  for (let i = 0; i < maxPts; i++) {
    const idx = Math.min(pts.length - 1, Math.round(i * step));
    out.push([Number(pts[idx][0].toFixed(5)), Number(pts[idx][1].toFixed(5))]);
  }
  return out;
}

/**
 * Projects decimated real Mars GeoJSON [lon, lat] points into the local 68m EVA sector,
 * anchored at the rover's landingPosition (Sol 0) and maintaining true relative shape.
 */
function normalizeLonLatToLocal(geoPts, landingPos, roverPos) {
  if (!geoPts || geoPts.length < 2) return [landingPos, roverPos];

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < geoPts.length; i++) {
    const [lon, lat] = geoPts[i];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLon = Math.max(1e-5, maxLon - minLon);
  const spanLat = Math.max(1e-5, maxLat - minLat);
  const cosLat = Math.cos(((minLat + maxLat) * 0.5 * Math.PI) / 180);
  const spanDeg = Math.max(spanLon * cosLat, spanLat);
  const scaleToMeters = 19.0 / spanDeg;

  const [startLon, startLat] = geoPts[0];
  return geoPts.map(([lon, lat]) => {
    const dx = (lon - startLon) * cosLat * scaleToMeters;
    const dz = -(lat - startLat) * scaleToMeters; // North is negative Z
    const clampedX = Math.max(-28, Math.min(28, Number((landingPos[0] + dx).toFixed(2))));
    const clampedZ = Math.max(-28, Math.min(28, Number((landingPos[1] + dz).toFixed(2))));
    return [clampedX, clampedZ];
  });
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
        rover.position
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
