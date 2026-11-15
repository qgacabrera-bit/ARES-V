import * as THREE from 'three';

function hash3(x, y, z, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 53.17) * 43758.5453;
  return n - Math.floor(n);
}

function fbm3(x, y, z, seed) {
  const n1 = Math.sin(x * 2.3 + seed) * Math.cos(y * 2.7 - seed * 0.7) * Math.sin(z * 2.1 + seed * 1.3);
  const n2 = Math.sin(x * 5.1 - seed * 1.1) * Math.cos(y * 4.9 + seed * 0.4) * Math.cos(z * 5.3 - seed * 0.9);
  const n3 = (hash3(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4), seed) - 0.5) * 0.35;
  return n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
}

export function createOutcropGeometry(seed = 1, rx = 0.8, ry = 0.5, rz = 0.7, detail = 2, stratify = 0) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const n = fbm3(x, y, z, seed);
    const strata = stratify > 0 ? Math.sin(y * 14.0 + seed) * stratify : 0;
    const radialScale = 1 + n * 0.28 + strata;

    // Flatten underside slightly so rocks sit naturally in Martian regolith
    const yScaled = y < -0.2 ? y * 0.55 : y;

    x *= rx * radialScale;
    y = yScaled * ry * radialScale;
    z *= rz * radialScale;

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

export function createStratifiedSlabGeometry(seed = 1, width = 1.4, height = 0.28, depth = 1.0) {
  const geo = new THREE.CylinderGeometry(0.92, 1.08, 1, 20, 4);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const angle = Math.atan2(z, x);
    const edgeNoise =
      Math.sin(angle * 3 + seed) * 0.14 +
      Math.cos(angle * 5 - seed * 1.4) * 0.08 +
      fbm3(x, y, z, seed) * 0.12;
    const strataStep = Math.sin(y * 12 + seed) * 0.06;

    x *= (width * 0.5) * (1 + edgeNoise + strataStep);
    z *= (depth * 0.5) * (1 + edgeNoise - strataStep * 0.5);
    y = (y + 0.5) * height * (1 + fbm3(x * 0.7, 0, z * 0.7, seed + 3) * 0.18);

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

export function createBoxworkVeinGeometry(seed = 1, length = 1.4, height = 0.24, thickness = 0.11) {
  const geo = new THREE.BoxGeometry(length, height, thickness, 14, 3, 2);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const u = x / (length * 0.5); // -1 to 1 along ridge
    const v = (y + height * 0.5) / height; // 0 bottom to 1 top

    // Taper top edge slightly like a weathered mineral fin & wave along length
    const taper = 1 - v * 0.42;
    const waveZ = Math.sin(u * 3.8 + seed) * thickness * 0.45;
    const crest = Math.sin(u * 6.5 + seed * 1.7) * height * 0.16 + Math.cos(u * 2.2 - seed) * height * 0.1;

    z = z * taper + waveZ;
    if (v > 0.1) {
      y += crest * v;
    }
    // Slight taper at ends so veins blend into host rock
    y -= Math.pow(Math.abs(u), 3) * height * 0.35 * v;

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

export function createSandDriftGeometry(seed = 1, rx = 0.9, height = 0.24, rz = 0.65) {
  const geo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const ripple = Math.sin(x * 16 + z * 6 + seed) * 0.045 * (1 - y * 0.3);
    const windTail = x > 0 ? 1 + x * 0.22 : 1;

    x *= rx * windTail;
    z *= rz * (1 - Math.abs(x) * 0.15);
    y = Math.max(0, y * height + ripple * height * 2.2);

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

let cachedTextures = null;

function makeCanvasTexture(size, drawFn, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function getRockTextures() {
  if (cachedTextures) return cachedTextures;

  const mudstoneMap = makeCanvasTexture(128, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#a66d50');
    grad.addColorStop(0.25, '#7e4a35');
    grad.addColorStop(0.5, '#965e44');
    grad.addColorStop(0.75, '#683b2a');
    grad.addColorStop(1, '#8c553d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(255,215,180,0.12)' : 'rgba(30,12,8,0.16)';
      ctx.fillRect(0, y, s, 2);
    }
    for (let i = 0; i < 420; i++) {
      const rx = (Math.sin(i * 19.3) * 0.5 + 0.5) * s;
      const ry = (Math.cos(i * 41.7) * 0.5 + 0.5) * s;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(40,18,12,0.18)' : 'rgba(220,160,120,0.14)';
      ctx.fillRect(rx, ry, 2, 2);
    }
  });

  const basaltMap = makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#3d302d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) {
      const rx = (Math.sin(i * 13.7) * 0.5 + 0.5) * s;
      const ry = (Math.cos(i * 29.1) * 0.5 + 0.5) * s;
      const r = 1 + (i % 3);
      ctx.fillStyle =
        i % 5 === 0
          ? 'rgba(180,105,70,0.22)' // Martian dust in vesicles
          : i % 3 === 0
          ? 'rgba(18,14,14,0.45)' // Vesicle pit
          : 'rgba(130,140,155,0.16)'; // Plagioclase mineral fleck
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const carbonateMap = makeCanvasTexture(128, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#d8cab4');
    grad.addColorStop(0.45, '#bfa788');
    grad.addColorStop(0.75, '#e2d7c5');
    grad.addColorStop(1, '#b29776');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 350; i++) {
      const rx = (Math.sin(i * 23.1) * 0.5 + 0.5) * s;
      const ry = (Math.cos(i * 17.9) * 0.5 + 0.5) * s;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(120,90,60,0.14)';
      ctx.fillRect(rx, ry, 3, 2);
    }
  });

  const boxworkMap = makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#dec9b2';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,248,238,0.45)' : 'rgba(135,95,70,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, (i * 7) % s);
      ctx.lineTo(s, ((i * 11 + 20) % s));
      ctx.stroke();
    }
  });

  const regolithMap = makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#b8623f';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 6) {
      ctx.fillStyle = 'rgba(225,135,95,0.18)';
      ctx.fillRect(x, 0, 2, s);
      ctx.fillStyle = 'rgba(70,30,18,0.18)';
      ctx.fillRect(x + 3, 0, 2, s);
    }
  });

  cachedTextures = {
    mudstoneMap,
    basaltMap,
    carbonateMap,
    boxworkMap,
    regolithMap,
  };
  return cachedTextures;
}
