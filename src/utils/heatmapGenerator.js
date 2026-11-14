import {
  MAP_3X3_RANGE,
  MAP_3X3_SPAN,
  fbm2D,
  getLocalRadiation,
  getSpectralSignature,
  getTerrainHeightAt,
  getTerrainSlopeAndNormal,
} from './terrainMath';

export const HEATMAP_WORLD_RANGE = MAP_3X3_RANGE + 3; // 54m half-span (covers 102m 3x3 window + 3m pan buffer)
export const HEATMAP_WORLD_SPAN = HEATMAP_WORLD_RANGE * 2; // 108m
export const HEATMAP_SVG_PX = 220;
export const HEATMAP_SVG_EXTENT = (HEATMAP_WORLD_SPAN / MAP_3X3_SPAN) * HEATMAP_SVG_PX;
const GRID_RES = 128;

export const LAYER_HEATMAP_META = {
  OPTICAL: {
    title: 'MARS TREK // ROVER COVERAGE & FRONTIER HEATMAP',
    sourceNote: 'Mars Trek MRO Mosaic + Traverse Coverage Kernel',
    minLabel: 'UNSURVEYED',
    midLabel: 'ROVER CORRIDOR',
    maxLabel: 'HIGH-PRIORITY FRONTIER',
    gradientCss:
      'linear-gradient(90deg, rgba(16,185,129,0.85) 0%, rgba(34,211,238,0.92) 38%, rgba(15,23,42,0.75) 55%, rgba(168,85,247,0.92) 78%, rgba(236,72,153,0.98) 100%)',
  },
  TOPOGRAPHY: {
    title: 'HiRISE / MOLA // CONTINUOUS SLOPE & ELEVATION HEATMAP',
    sourceNote: 'DEM Terrain Gradient (° Slope) + Hillshade Contours',
    minLabel: '0° FLAT CORRIDOR',
    midLabel: '14°–20° CAUTION',
    maxLabel: '26°+ SCARP HAZARD',
    gradientCss:
      'linear-gradient(90deg, rgba(16,185,129,0.88) 0%, rgba(132,204,22,0.92) 30%, rgba(250,204,21,0.95) 55%, rgba(249,115,22,0.96) 78%, rgba(239,68,68,0.98) 100%)',
  },
  SPECTRAL: {
    title: 'USGS GEOLOGY // CRISM MINERAL ABUNDANCE HEATMAP',
    sourceNote: 'Cyan: Smectite Clay · Amber: Sulfate Veins · Green: Carbonate/Silica',
    minLabel: 'FE/MG CLAY (CYAN)',
    midLabel: 'SULFATE / JAROSITE (AMBER)',
    maxLabel: 'CARBONATE / SILICA (GREEN)',
    gradientCss:
      'linear-gradient(90deg, rgba(6,182,212,0.95) 0%, rgba(56,189,248,0.92) 28%, rgba(245,158,11,0.95) 55%, rgba(16,185,129,0.95) 85%, rgba(52,211,153,0.98) 100%)',
  },
  ENV: {
    title: 'RAD / WORLDVIEW // IONIZING DOSE & DUST OPACITY HEATMAP',
    sourceNote: 'Curiosity RAD (mSv/day) + Topographic Dust Convergence',
    minLabel: '0.56 mSv/d SHIELDED',
    midLabel: '0.68 mSv/d NOMINAL',
    maxLabel: '0.82+ mSv/d PEAK EXPOSURE',
    gradientCss:
      'linear-gradient(90deg, rgba(59,130,246,0.9) 0%, rgba(99,102,241,0.92) 30%, rgba(168,85,247,0.94) 55%, rgba(236,72,153,0.96) 78%, rgba(245,158,11,0.98) 100%)',
  },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function interpolateStops(stops, t) {
  const clamped = clamp01(t);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (clamped >= a[0] && clamped <= b[0]) {
      const span = Math.max(1e-5, b[0] - a[0]);
      const f = (clamped - a[0]) / span;
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
        Math.round(a[4] + (b[4] - a[4]) * f),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = clamp01(((px - ax) * abx + (pz - az) * abz) / lenSq);
  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz));
}

function distToPolyline(px, pz, points) {
  if (!points || points.length === 0) return 999;
  if (points.length === 1) return Math.hypot(px - points[0][0], pz - points[0][1]);
  let minD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(px, pz, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Extracts clean SVG iso-contour path strings from a scalar field via Marching Squares.
 */
function buildMarchingSquaresPath(field, res, threshold, svgSize = HEATMAP_SVG_PX) {
  const step = 2; // Sample at 2px strides for crisp smooth isoline geometry
  const parts = [];
  const toSvg = (gx, gy) => [
    (((gx + 0.5) / res) * svgSize).toFixed(1),
    (((gy + 0.5) / res) * svgSize).toFixed(1),
  ];

  const interp = (v0, v1, x0, y0, x1, y1) => {
    const denom = v1 - v0;
    const t = Math.abs(denom) < 1e-5 ? 0.5 : clamp01((threshold - v0) / denom);
    return toSvg(x0 + t * (x1 - x0), y0 + t * (y1 - y0));
  };

  for (let y = 0; y < res - step; y += step) {
    for (let x = 0; x < res - step; x += step) {
      const vTL = field[y * res + x];
      const vTR = field[y * res + (x + step)];
      const vBR = field[(y + step) * res + (x + step)];
      const vBL = field[(y + step) * res + x];

      const code =
        (vTL >= threshold ? 8 : 0) |
        (vTR >= threshold ? 4 : 0) |
        (vBR >= threshold ? 2 : 0) |
        (vBL >= threshold ? 1 : 0);

      if (code === 0 || code === 15) continue;

      const top = () => interp(vTL, vTR, x, y, x + step, y);
      const right = () => interp(vTR, vBR, x + step, y, x + step, y + step);
      const bottom = () => interp(vBL, vBR, x, y + step, x + step, y + step);
      const left = () => interp(vTL, vBL, x, y, x, y + step);

      const segs = [];
      switch (code) {
        case 1:
        case 14:
          segs.push([left(), bottom()]);
          break;
        case 2:
        case 13:
          segs.push([bottom(), right()]);
          break;
        case 3:
        case 12:
          segs.push([left(), right()]);
          break;
        case 4:
        case 11:
          segs.push([top(), right()]);
          break;
        case 5:
          segs.push([top(), left()], [bottom(), right()]);
          break;
        case 6:
        case 9:
          segs.push([top(), bottom()]);
          break;
        case 7:
        case 8:
          segs.push([top(), left()]);
          break;
        case 10:
          segs.push([top(), right()], [left(), bottom()]);
          break;
        default:
          break;
      }

      for (let s = 0; s < segs.length; s++) {
        const [p0, p1] = segs[s];
        parts.push(`M${p0[0]},${p0[1]}L${p1[0]},${p1[1]}`);
      }
    }
  }

  return parts.join('');
}

const TOPO_SLOPE_STOPS = [
  [0.0, 16, 185, 129, 14],
  [0.25, 34, 211, 238, 28],
  [0.45, 163, 230, 53, 46],
  [0.64, 250, 204, 21, 66],
  [0.82, 249, 115, 22, 82],
  [1.0, 239, 68, 68, 98],
];

const RAD_DOSE_STOPS = [
  [0.0, 37, 99, 235, 30],
  [0.28, 99, 102, 241, 48],
  [0.52, 168, 85, 247, 64],
  [0.76, 236, 72, 153, 82],
  [0.92, 239, 68, 68, 92],
  [1.0, 245, 158, 11, 102],
];

const EXP_CORRIDOR_STOPS = [
  [0.0, 6, 182, 212, 0],
  [0.25, 16, 185, 129, 22],
  [0.58, 20, 184, 166, 46],
  [0.85, 34, 211, 238, 68],
  [1.0, 103, 232, 249, 86],
];

const UNEXP_FRONTIER_STOPS = [
  [0.0, 139, 92, 246, 0],
  [0.25, 147, 51, 234, 24],
  [0.58, 168, 85, 247, 54],
  [0.85, 217, 70, 239, 76],
  [1.0, 244, 114, 182, 92],
];

/**
 * Computes a continuous spatial raster heatmap + iso-contours over a 3x3 chunk window centered at centerXZ.
 */
export function generateSectorHeatmap(site, evaLayer, rover, traversePoints = [], centerXZ = [0, 0]) {
  const res = GRID_RES;
  const cx0 = Number(centerXZ?.[0] ?? 0);
  const cz0 = Number(centerXZ?.[1] ?? 0);
  const profile = site?.terrainProfile;
  const seed = profile?.seed ?? 17.3;
  const targets = site?.targets || [];
  const baseRad = site?.baseRadiation ?? 0.64;

  const effectiveTraverse =
    traversePoints?.length >= 2 ? traversePoints : rover?.traversePoints || [];
  const exploredWaypoints = [
    ...(rover?.routeWaypoints || []).map((w) => w.position),
    ...targets.filter((t) => t.roverExplored).map((t) => t.position),
  ];
  const unexploredTargets = targets.filter((t) => !t.roverExplored).map((t) => t.position);
  const unexploredAnchor = rover?.unexploredSector?.center || null;

  const expField = new Float32Array(res * res);
  const unexpField = new Float32Array(res * res);
  const primaryField = new Float32Array(res * res);
  const rgba = new Uint8ClampedArray(res * res * 4);

  let elevMin = Infinity;
  let elevMax = -Infinity;
  const elevField = new Float32Array(res * res);
  const slopeField = new Float32Array(res * res);
  const radField = new Float32Array(res * res);

  // First pass: evaluate physical scalar fields across [cx0 ± 54m, cz0 ± 54m]
  for (let py = 0; py < res; py++) {
    const wz = cz0 + ((py + 0.5) / res) * HEATMAP_WORLD_SPAN - HEATMAP_WORLD_RANGE;
    for (let px = 0; px < res; px++) {
      const wx = cx0 + ((px + 0.5) / res) * HEATMAP_WORLD_SPAN - HEATMAP_WORLD_RANGE;
      const idx = py * res + px;

      const elev = getTerrainHeightAt(wx, wz, profile);
      const { slopeDeg, normal } = getTerrainSlopeAndNormal(wx, wz, profile);

      elevField[idx] = elev;
      slopeField[idx] = slopeDeg;
      if (elev < elevMin) elevMin = elev;
      if (elev > elevMax) elevMax = elev;

      // Natural organic geology perturbation from DEM FBM
      const geoMod = fbm2D(wx * 0.09, wz * 0.09, seed + 88, 3);

      // 1. Surveyed Rover Corridor continuous kernel field (path + sampled stations, slope-modulated)
      const dPath = distToPolyline(wx, wz, effectiveTraverse);
      let wpKernel = 0;
      for (let k = 0; k < exploredWaypoints.length; k++) {
        const dx = wx - exploredWaypoints[k][0];
        const dz = wz - exploredWaypoints[k][1];
        wpKernel = Math.max(wpKernel, Math.exp(-(dx * dx + dz * dz) / 42.0));
      }
      const slopeTraversability = clamp01(1.12 - slopeDeg / 32.0);
      const pathHeat = Math.exp(-(dPath * dPath) / 36.0);
      const rawExp = clamp01((Math.max(pathHeat * 0.95, wpKernel * 0.85) + geoMod * 0.14) * slopeTraversability);
      expField[idx] = rawExp;

      // 2. Unexplored Frontier continuous density field (unvisited targets + steep frontier scarps)
      let unexpKernel = 0;
      for (let k = 0; k < unexploredTargets.length; k++) {
        const dx = wx - unexploredTargets[k][0];
        const dz = wz - unexploredTargets[k][1];
        unexpKernel += Math.exp(-(dx * dx + dz * dz) / 72.0) * 0.82;
      }
      if (unexploredAnchor) {
        const dx = wx - unexploredAnchor[0];
        const dz = wz - unexploredAnchor[1];
        // Anisotropic terrain-following elongation + FBM modulation (never a flat circle)
        const warpX = dx * 0.88 + dz * 0.28 + geoMod * 3.8;
        const warpZ = dz * 1.08 - dx * 0.24 - geoMod * 3.2;
        const scarpBoost = clamp01(slopeDeg / 24.0) * 0.24;
        unexpKernel += Math.exp(-(warpX * warpX + warpZ * warpZ) / 135.0) * (0.78 + scarpBoost);
      }
      const rawUnexp = clamp01(unexpKernel * (0.85 + geoMod * 0.25) - rawExp * 0.72);
      unexpField[idx] = rawUnexp;

      // 3. Layer-specific RGBA mapping
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (evaLayer === 'TOPOGRAPHY') {
        const hillshade = clamp01(0.5 + (normal[0] * -0.55 + normal[2] * -0.45) * 0.85);
        const slopeNorm = clamp01((slopeDeg - 2.0) / 26.0);
        const compositeTopo = clamp01(slopeNorm * 0.86 + (1.0 - hillshade) * 0.14);
        [r, g, b, a] = interpolateStops(TOPO_SLOPE_STOPS, compositeTopo);
        primaryField[idx] = elev;
      } else if (evaLayer === 'SPECTRAL') {
        const spec = getSpectralSignature(wx, wz, profile, targets);
        // Sharpen mineral dominance while blending continuous transitions at contacts
        const wClay = Math.pow(spec.clay, 1.85);
        const wSulf = Math.pow(spec.sulfate, 1.85);
        const wCarb = Math.pow(spec.carbonate, 1.85);
        const wSum = Math.max(1e-4, wClay + wSulf + wCarb);
        const totalSignal = clamp01((spec.clay + spec.sulfate + spec.carbonate) / 1.45);

        // Cyan smectite (6, 182, 212), Amber sulfate (245, 158, 11), Emerald carbonate (16, 185, 129)
        r = Math.round((wClay * 6 + wSulf * 245 + wCarb * 16) / wSum);
        g = Math.round((wClay * 182 + wSulf * 158 + wCarb * 185) / wSum);
        b = Math.round((wClay * 212 + wSulf * 11 + wCarb * 129) / wSum);
        a = Math.round(clamp01(Math.pow(totalSignal, 1.1)) * 88);
        primaryField[idx] = spec.clay - spec.sulfate; // Mineral facies contact field
      } else if (evaLayer === 'ENV') {
        const rad = getLocalRadiation(wx, wz, elev, slopeDeg, baseRad);
        const dustPlume = clamp01(0.45 + fbm2D(wx * 0.055 + 11.4, wz * 0.055 - 7.2, seed + 610, 3) * 0.55);
        const radScore = clamp01((rad - (baseRad - 0.03)) / 0.21) * 0.78 + dustPlume * 0.22;
        radField[idx] = rad;
        primaryField[idx] = radScore;
        [r, g, b, a] = interpolateStops(RAD_DOSE_STOPS, radScore);
      } else {
        // OPTICAL: Dual thermal heatmap for Rover Surveyed Corridor (Cyan/Green) & Unexplored Frontier (Violet/Magenta)
        if (rawUnexp > rawExp * 0.85 && rawUnexp > 0.16) {
          [r, g, b, a] = interpolateStops(UNEXP_FRONTIER_STOPS, rawUnexp);
        } else if (rawExp > 0.14) {
          [r, g, b, a] = interpolateStops(EXP_CORRIDOR_STOPS, rawExp);
        }
        primaryField[idx] = rawUnexp - rawExp;
      }

      const o = idx * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }

  // Render smooth raster heatmap into an offscreen canvas & data URL
  let dataUrl = '';
  let smoothCanvas = null;
  if (typeof document !== 'undefined') {
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = res;
    rawCanvas.height = res;
    const rawCtx = rawCanvas.getContext('2d');
    if (rawCtx) {
      rawCtx.putImageData(new ImageData(rgba, res, res), 0, 0);

      smoothCanvas = document.createElement('canvas');
      smoothCanvas.width = 256;
      smoothCanvas.height = 256;
      const sCtx = smoothCanvas.getContext('2d');
      if (sCtx) {
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(rawCanvas, 0, 0, 256, 256);
        dataUrl = smoothCanvas.toDataURL('image/png');
      }
    }
  }

  // Compute organic Marching Squares contour paths in heatmap SVG coordinate space [0..HEATMAP_SVG_EXTENT]
  const expContourPath = buildMarchingSquaresPath(expField, res, 0.34, HEATMAP_SVG_EXTENT);
  const unexpContourPath = buildMarchingSquaresPath(unexpField, res, 0.34, HEATMAP_SVG_EXTENT);

  const layerContours = [];
  if (evaLayer === 'TOPOGRAPHY') {
    const span = Math.max(1.0, elevMax - elevMin);
    [0.24, 0.48, 0.72, 0.88].forEach((f) => {
      const d = buildMarchingSquaresPath(elevField, res, elevMin + span * f, HEATMAP_SVG_EXTENT);
      if (d) layerContours.push({ d, color: 'rgba(254, 240, 138, 0.38)', width: 0.6 });
    });
  } else if (evaLayer === 'SPECTRAL') {
    const dContact = buildMarchingSquaresPath(primaryField, res, 0.08, HEATMAP_SVG_EXTENT);
    if (dContact) layerContours.push({ d: dContact, color: 'rgba(224, 242, 254, 0.4)', width: 0.65 });
  } else if (evaLayer === 'ENV') {
    [0.42, 0.68, 0.85].forEach((th, i) => {
      const d = buildMarchingSquaresPath(primaryField, res, th, HEATMAP_SVG_EXTENT);
      if (d) {
        layerContours.push({
          d,
          color: i === 2 ? 'rgba(251, 191, 36, 0.48)' : 'rgba(233, 213, 255, 0.32)',
          width: 0.6,
        });
      }
    });
  }

  return {
    canvas: smoothCanvas,
    dataUrl,
    centerXZ: [cx0, cz0],
    worldRange: HEATMAP_WORLD_RANGE,
    worldSpan: HEATMAP_WORLD_SPAN,
    svgExtent: HEATMAP_SVG_EXTENT,
    expContourPath,
    unexpContourPath,
    layerContours,
    meta: LAYER_HEATMAP_META[evaLayer] || LAYER_HEATMAP_META.OPTICAL,
  };
}
