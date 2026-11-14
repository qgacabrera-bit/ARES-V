import { getTerrainHeightAt, getTerrainSlopeAndNormal } from './terrainMath';

const GRID_MIN = -85;
const GRID_MAX = 85;
const GRID_SIZE = 68; // 68 x 68 cells => 2.5m spacing
const CELL_SIZE = (GRID_MAX - GRID_MIN) / (GRID_SIZE - 1);

const NEIGHBORS = [
  [-1, 0, 1],
  [1, 0, 1],
  [0, -1, 1],
  [0, 1, 1],
  [-1, -1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, 1, Math.SQRT2],
];

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(node) {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      const tmp = this.items[p];
      this.items[p] = this.items[i];
      this.items[i] = tmp;
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = end;
      let i = 0;
      const len = this.items.length;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < len && this.items[l].f < this.items[smallest].f) smallest = l;
        if (r < len && this.items[r].f < this.items[smallest].f) smallest = r;
        if (smallest === i) break;
        const tmp = this.items[i];
        this.items[i] = this.items[smallest];
        this.items[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
  get length() {
    return this.items.length;
  }
}

function worldToGrid(x, z) {
  const gx = Math.round((Math.min(GRID_MAX, Math.max(GRID_MIN, x)) - GRID_MIN) / CELL_SIZE);
  const gz = Math.round((Math.min(GRID_MAX, Math.max(GRID_MIN, z)) - GRID_MIN) / CELL_SIZE);
  return [
    Math.min(GRID_SIZE - 1, Math.max(0, gx)),
    Math.min(GRID_SIZE - 1, Math.max(0, gz)),
  ];
}

function gridToWorld(gx, gz) {
  return [GRID_MIN + gx * CELL_SIZE, GRID_MIN + gz * CELL_SIZE];
}

function chaikinSmooth(pts, passes = 2) {
  if (pts.length < 3) return pts;
  let current = pts;
  for (let p = 0; p < passes; p++) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/**
 * Computes the lowest-slope (<15° preferred) 8-connected A* path from startXZ to goalXZ.
 */
export function computeSafeTraversePath(startXZ, goalXZ, siteProfile) {
  const totalCells = GRID_SIZE * GRID_SIZE;
  const slopes = new Float32Array(totalCells);

  for (let gz = 0; gz < GRID_SIZE; gz++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const [wx, wz] = gridToWorld(gx, gz);
      const { slopeDeg } = getTerrainSlopeAndNormal(wx, wz, siteProfile);
      slopes[gz * GRID_SIZE + gx] = slopeDeg;
    }
  }

  const [sx, sz] = worldToGrid(startXZ[0], startXZ[1]);
  const [ex, ez] = worldToGrid(goalXZ[0], goalXZ[1]);

  const startIdx = sz * GRID_SIZE + sx;
  const goalIdx = ez * GRID_SIZE + ex;

  const gScore = new Float32Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);

  gScore[startIdx] = 0;
  const open = new MinHeap();
  const h0 = Math.hypot(ex - sx, ez - sz) * CELL_SIZE;
  open.push({ idx: startIdx, f: h0 });

  while (open.length > 0) {
    const { idx } = open.pop();
    if (idx === goalIdx) break;
    if (closed[idx]) continue;
    closed[idx] = 1;

    const cx = idx % GRID_SIZE;
    const cz = (idx - cx) / GRID_SIZE;

    for (let k = 0; k < NEIGHBORS.length; k++) {
      const [dx, dz, stepMult] = NEIGHBORS[k];
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;

      const nIdx = nz * GRID_SIZE + nx;
      if (closed[nIdx]) continue;

      const slope = Math.max(slopes[idx], slopes[nIdx]);
      const stepDist = stepMult * CELL_SIZE;

      let penalty = 1.0 + slope * 0.03;
      if (slope > 25) {
        penalty = 12.0 + (slope - 25) * 2.0;
      } else if (slope >= 15) {
        penalty = 2.5 + (slope - 15) * 0.45;
      }

      const tentativeG = gScore[idx] + stepDist * penalty;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = idx;
        gScore[nIdx] = tentativeG;
        const h = Math.hypot(ex - nx, ez - nz) * CELL_SIZE;
        open.push({ idx: nIdx, f: tentativeG + h });
      }
    }
  }

  // Reconstruct grid path
  const rawXZ = [];
  let cur = goalIdx;
  if (cameFrom[cur] === -1 && cur !== startIdx) {
    rawXZ.push(startXZ, goalXZ);
  } else {
    while (cur !== -1) {
      const gx = cur % GRID_SIZE;
      const gz = (cur - gx) / GRID_SIZE;
      rawXZ.push(gridToWorld(gx, gz));
      if (cur === startIdx) break;
      cur = cameFrom[cur];
    }
    rawXZ.reverse();
    rawXZ[0] = startXZ;
    rawXZ[rawXZ.length - 1] = goalXZ;
  }

  const smoothedXZ = chaikinSmooth(rawXZ, 2);

  // Downsample to clean spaced waypoints (~1.8m–2.5m apart) & clamp to terrain elevation
  const points = [];
  let maxSlopeDeg = 0;
  let distanceMeters = 0;

  for (let i = 0; i < smoothedXZ.length; i++) {
    const [x, z] = smoothedXZ[i];
    if (i > 0 && i < smoothedXZ.length - 1) {
      const prev = points[points.length - 1];
      if (Math.hypot(x - prev[0], z - prev[2]) < 1.65) continue;
    }

    const y = getTerrainHeightAt(x, z, siteProfile) + 0.16;
    const { slopeDeg } = getTerrainSlopeAndNormal(x, z, siteProfile);
    if (slopeDeg > maxSlopeDeg) maxSlopeDeg = slopeDeg;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      distanceMeters += Math.hypot(x - prev[0], z - prev[2]);
    }
    points.push([x, y, z]);
  }

  return {
    points,
    distanceMeters: Number(distanceMeters.toFixed(1)),
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(1)),
  };
}
