import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { LANDING_ZONES } from '../../data/landingZones';
import { useMissionStore } from '../../store/useMissionStore';
import { latLonToVector3 } from '../../utils/terrainMath';
import { createPlaceholderTexture, loadMarsWmtsTextures } from '../../utils/wmtsLoader';

const GLOBE_RADIUS = 3.3895; // 1 unit = 1,000 km (Mars mean radius: 3,389.5 km)

const STARFIELD_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (280.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STARFIELD_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(vColor, alpha * 0.9);
  }
`;

function OrbitalStarfield() {
  const count = 2800;

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Deterministic spherical distribution far behind the Mars globe (radius 120..210)
      const u = Math.sin(i * 12.9898) * 43758.5453;
      const v = Math.sin(i * 78.233) * 43758.5453;
      const w = Math.sin(i * 45.164) * 43758.5453;
      const r1 = u - Math.floor(u);
      const r2 = v - Math.floor(v);
      const r3 = w - Math.floor(w);

      const radius = 120 + r3 * 90;
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi);
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      color.setHSL(0.58 + (r1 - 0.5) * 0.16, 0.25, 0.78 + r2 * 0.22);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;

      sz[i] = 0.8 + r3 * 1.9;
    }

    return { positions: pos, colors: col, sizes: sz };
  }, []);

  return (
    <points renderOrder={0} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={STARFIELD_VERTEX_SHADER}
        fragmentShader={STARFIELD_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

const ATMOS_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMOS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(0.66 - dot(vNormal, viewDir), 3.1);
    gl_FragColor = vec4(uColor, clamp(rim, 0.0, 0.52));
  }
`;

function RoverOrbitalTrackOverlay({ site, highlighted }) {
  const resources = useMemo(() => {
    const rover = site?.nasaRover;
    const rawPts = rover?.realGeoJsonLonLat;
    if (!rawPts || rawPts.length < 2) return null;

    const [startLon, startLat] = rawPts[0];
    // Amplify km-scale rover track (~14x) around site coordinates so the exact path geometry
    // is clearly legible from orbital altitude without shrinking sub-pixel.
    const amp = 14.0;
    const worldPts = rawPts.map(([lon, lat]) => {
      const pLat = site.lat + (lat - startLat) * amp;
      const pLon = site.lon + (lon - startLon) * amp;
      const [vx, vy, vz] = latLonToVector3(pLat, pLon, GLOBE_RADIUS + 0.045);
      return new THREE.Vector3(vx, vy, vz);
    });

    const coreGeom = new THREE.BufferGeometry().setFromPoints(worldPts);
    const coreMat = new THREE.LineBasicMaterial({
      color: '#22c55e',
      transparent: true,
      opacity: highlighted ? 0.98 : 0.65,
    });
    const coreLine = new THREE.Line(coreGeom, coreMat);

    const hiPts = worldPts.map((v) => v.clone().normalize().multiplyScalar(GLOBE_RADIUS + 0.052));
    const hiGeom = new THREE.BufferGeometry().setFromPoints(hiPts);
    const hiMat = new THREE.LineDashedMaterial({
      color: '#86efac',
      dashSize: 0.036,
      gapSize: 0.02,
      transparent: true,
      opacity: highlighted ? 0.96 : 0.45,
    });
    const hiLine = new THREE.Line(hiGeom, hiMat);
    hiLine.computeLineDistances();

    const landingVec = worldPts[0].clone().normalize().multiplyScalar(GLOBE_RADIUS + 0.054);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      landingVec.clone().normalize()
    );

    return {
      coreLine,
      hiLine,
      coreGeom,
      coreMat,
      hiGeom,
      hiMat,
      landingPos: [landingVec.x, landingVec.y, landingVec.z],
      landingQuat: quat,
    };
  }, [site, highlighted]);

  useEffect(() => {
    return () => {
      if (!resources) return;
      resources.coreGeom.dispose();
      resources.coreMat.dispose();
      resources.hiGeom.dispose();
      resources.hiMat.dispose();
    };
  }, [resources]);

  useFrame(({ clock }) => {
    if (!resources) return;
    const t = clock.getElapsedTime();
    resources.hiMat.opacity = highlighted ? 0.68 + 0.32 * Math.sin(t * 4.2) : 0.45;
  });

  if (!resources) return null;

  return (
    <group>
      <primitive object={resources.coreLine} />
      <primitive object={resources.hiLine} />
      {/* Yellow Rover Sol 0 Touchdown Pin on Mars Globe */}
      <group position={resources.landingPos} quaternion={resources.landingQuat}>
        <mesh renderOrder={3} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.024, 0.038, 24]} />
          <meshBasicMaterial
            color="#fde047"
            transparent
            opacity={highlighted ? 0.95 : 0.65}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh renderOrder={3} position={[0, 0.012, 0]}>
          <sphereGeometry args={[highlighted ? 0.02 : 0.014, 12, 12]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      </group>
    </group>
  );
}

function LandingBeacon({ site, isSelected, isHovered, isDeployingTarget, deployProgress, onSelect, onHover }) {
  const ringRef = useRef();
  const pulseRef = useRef();
  const lockRingRef = useRef();
  // Slightly above GLOBE_RADIUS + max displacement so pins sit cleanly over high terrain
  const pos = useMemo(
    () => latLonToVector3(site.lat, site.lon, GLOBE_RADIUS + 0.042),
    [site.lat, site.lon]
  );

  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3(...pos).normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, normal);
  }, [pos]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const s = isDeployingTarget
        ? 1.45 + Math.sin(t * 14.0) * 0.15
        : isSelected
        ? 1.25 + Math.sin(t * 3.5) * 0.12
        : 1.0 + Math.sin(t * 2.4 + site.lat) * 0.08;
      ringRef.current.scale.set(s, s, s);
      ringRef.current.rotation.z = isDeployingTarget ? t * 3.2 : 0;
    }
    if (pulseRef.current) {
      const cycle = (t * (isDeployingTarget ? 2.2 : 0.8) + Math.abs(site.lat) * 0.03) % 1;
      const scale = 1.0 + cycle * (isDeployingTarget ? 2.8 : 1.9);
      pulseRef.current.scale.set(scale, scale, scale);
      pulseRef.current.material.opacity = (1.0 - cycle) * (isDeployingTarget ? 0.95 : isSelected ? 0.85 : 0.45);
    }
    if (lockRingRef.current) {
      if (isDeployingTarget) {
        const shrink = THREE.MathUtils.lerp(3.2, 0.9, deployProgress);
        lockRingRef.current.scale.set(shrink, shrink, shrink);
        lockRingRef.current.rotation.z = -t * 2.6;
        lockRingRef.current.material.opacity = 0.85;
      } else {
        lockRingRef.current.material.opacity = 0;
      }
    }
  });

  const accentColor = isDeployingTarget
    ? '#22d3ee'
    : isSelected
    ? '#38bdf8'
    : isHovered
    ? '#fbbf24'
    : '#f97316';

  const rover = site.nasaRover;

  return (
    <group position={pos} quaternion={quaternion} scale={1.5}>
      {/* Generous invisible click/hover hit sphere */}
      <mesh
        renderOrder={2}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(site.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover(site.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
          onHover(null);
        }}
      >
        <sphereGeometry args={[0.17, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Expanding radar pulse ring */}
      <mesh ref={pulseRef} renderOrder={2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[0.06, 0.075, 32]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Contracting EDL target-lock ring during dive */}
      <mesh ref={lockRingRef} renderOrder={2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.075, 0.09, 6]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Main target ring */}
      <mesh ref={ringRef} renderOrder={2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.048, 0.066, 32]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical orbital pin */}
      <mesh renderOrder={2} position={[0, 0.085, 0]}>
        <cylinderGeometry args={[0.004, 0.008, 0.16, 8]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.85} />
      </mesh>

      {/* Top rover beacon node */}
      <mesh renderOrder={2} position={[0, 0.17, 0]}>
        <sphereGeometry args={[isSelected ? 0.032 : 0.025, 16, 16]} />
        <meshBasicMaterial color={isSelected ? '#e0f2fe' : accentColor} />
      </mesh>

      {/* Actual NASA Rover Label shown on hover or selection */}
      {(isHovered || (isSelected && !isDeployingTarget)) && (
        <Html position={[0, 0.28, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="scene-tag">
            <div className="place text-[14px]">{site.name}</div>
            <div className="text-dim">
              {rover?.name || site.shortName} · {rover?.landingCoordinates || site.coordinates}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

const DEPLOY_DURATION_SEC = 1.75;
const SLEW_DURATION_SEC = 0.7;

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function safeUnitRotation(fromDir, toDir) {
  const dot = THREE.MathUtils.clamp(fromDir.dot(toDir), -1, 1);
  if (dot < -0.999) {
    const ortho = Math.abs(fromDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const axis = new THREE.Vector3().crossVectors(fromDir, ortho).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(fromDir, toDir);
}

export default function OrbitGlobe() {
  const globeGroupRef = useRef();
  const marsMatRef = useRef();
  const atmosMatRef = useRef();
  const controlsRef = useRef();

  const orbitalLayer = useMissionStore((s) => s.orbitalLayer);
  const selectedSiteId = useMissionStore((s) => s.selectedSiteId);
  const hoveredSiteId = useMissionStore((s) => s.hoveredSiteId);
  const isDeploying = useMissionStore((s) => s.isDeploying);
  const deployProgress = useMissionStore((s) => s.deployProgress);
  const selectSite = useMissionStore((s) => s.selectSite);
  const setHoveredSite = useMissionStore((s) => s.setHoveredSite);
  const setOrbitalDataSource = useMissionStore((s) => s.setOrbitalDataSource);
  const updateDeployProgress = useMissionStore((s) => s.updateDeployProgress);
  const completeDeployToSurface = useMissionStore((s) => s.completeDeployToSurface);

  const { camera } = useThree();
  const [marsTextures, setMarsTextures] = useState(null);

  const slewRef = useRef({
    active: false,
    elapsed: 0,
    startDir: new THREE.Vector3(0, 0, 1),
    radius: 8.9,
  });

  const deployAnimRef = useRef({
    elapsed: 0,
    completed: false,
    startDir: new THREE.Vector3(0, 0, 1),
    startRadius: 8.9,
    startTarget: new THREE.Vector3(0, 0, 0),
  });

  const identQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempCurDir = useMemo(() => new THREE.Vector3(), []);
  const tempWorldBeacon = useMemo(() => new THREE.Vector3(), []);
  const tempWorldNormal = useMemo(() => new THREE.Vector3(), []);
  const tempLookTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    camera.rotation.order = 'XYZ';
    camera.up.set(0, 1, 0);
    camera.position.set(0, 1.44, 8.9);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [camera]);

  // Stage 1: Smooth camera alignment slew when clicking a landing beacon
  useEffect(() => {
    if (!selectedSiteId || isDeploying) return;
    slewRef.current = {
      active: true,
      elapsed: 0,
      startDir: camera.position.clone().normalize(),
      radius: Math.max(5.25, camera.position.length()),
    };
  }, [selectedSiteId, isDeploying, camera]);

  // Stage 2: Capture initial orbital vector when deployment dive starts
  useEffect(() => {
    if (!isDeploying) return;
    slewRef.current.active = false;
    deployAnimRef.current = {
      elapsed: 0,
      completed: false,
      startDir: camera.position.clone().normalize(),
      startRadius: camera.position.length(),
      startTarget: controlsRef.current
        ? controlsRef.current.target.clone()
        : new THREE.Vector3(0, 0, 0),
    };
  }, [isDeploying, camera]);

  const placeholderTex = useMemo(() => createPlaceholderTexture(), []);

  const overlayUniforms = useMemo(
    () => ({
      uThermal: { value: 0 },
      uIce: { value: 0 },
      uTime: { value: 0 },
    }),
    []
  );

  // Load local bundled NASA MOLA/Viking maps or CORS-enabled remote fallback
  useEffect(() => {
    let active = true;
    loadMarsWmtsTextures().then((result) => {
      if (!active) return;
      setOrbitalDataSource(result.status);
      if (result.textures) {
        setMarsTextures(result.textures);
      }
    });
    return () => {
      active = false;
    };
  }, [setOrbitalDataSource]);

  const atmosUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#e07a5f') },
    }),
    []
  );

  const targetAtmosColor = useMemo(() => new THREE.Color('#e07a5f'), []);

  // Inject THERMAL (THEMIS IR) & SUBSURFACE ICE (SHARAD) overlays onto MeshStandardMaterial
  const handleBeforeCompile = useMemo(
    () => (shader) => {
      shader.uniforms.uThermal = overlayUniforms.uThermal;
      shader.uniforms.uIce = overlayUniforms.uIce;
      shader.uniforms.uTime = overlayUniforms.uTime;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSpherePos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpherePos = normalize(position);');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uThermal;
          uniform float uIce;
          uniform float uTime;
          varying vec3 vSpherePos;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          #ifdef USE_BUMPMAP
            float molaElev = texture2D( bumpMap, vBumpMapUv ).r;
          #else
            float molaElev = 0.5;
          #endif

          float albedoLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );

          // 2. THERMAL (THEMIS Day/Night IR inertia: rocky basins warm amber/crimson, dusty highlands indigo/violet)
          float thermalInertia = clamp( (1.0 - molaElev) * 0.62 + (1.0 - albedoLum) * 0.48, 0.0, 1.0 );
          vec3 tIndigo = vec3( 0.11, 0.07, 0.36 );
          vec3 tViolet = vec3( 0.38, 0.14, 0.58 );
          vec3 tAmber  = vec3( 0.96, 0.56, 0.11 );
          vec3 tCrimson = vec3( 0.94, 0.20, 0.16 );
          vec3 thermalCol = mix( tIndigo, tViolet, smoothstep( 0.15, 0.42, thermalInertia ) );
          thermalCol = mix( thermalCol, tAmber, smoothstep( 0.42, 0.72, thermalInertia ) );
          thermalCol = mix( thermalCol, tCrimson, smoothstep( 0.72, 0.95, thermalInertia ) );
          thermalCol *= ( 0.65 + 0.65 * molaElev );

          // 3. SUBSURFACE ICE (SHARAD polar & mid-latitude >40°N/S cyan/ice-blue radar abundance)
          float absLat = abs( vSpherePos.y ); // sin(40°) = 0.6428
          float latBand = smoothstep( 0.58, 0.74, absLat + ( molaElev - 0.5 ) * 0.08 );
          float radarSweep = 0.88 + 0.12 * sin( vSpherePos.y * 80.0 - uTime * 1.6 );
          vec3 dryCrust = vec3( 0.13, 0.17, 0.23 ) * ( 0.45 + 0.85 * molaElev );
          vec3 iceMid = vec3( 0.06, 0.62, 0.95 );
          vec3 iceCore = vec3( 0.54, 0.95, 1.0 );
          vec3 iceCol = mix( dryCrust, iceMid, smoothstep( 0.10, 0.55, latBand ) );
          iceCol = mix( iceCol, iceCore, smoothstep( 0.55, 0.92, latBand ) ) * radarSweep;

          diffuseColor.rgb = mix( diffuseColor.rgb, thermalCol, uThermal );
          diffuseColor.rgb = mix( diffuseColor.rgb, iceCol, uIce );`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * ( uThermal * 0.22 + uIce * 0.24 );`
        );
    },
    [overlayUniforms]
  );

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const lerpSpeed = Math.min(1, dt * 5.5);

    overlayUniforms.uTime.value = t;
    overlayUniforms.uThermal.value = THREE.MathUtils.lerp(
      overlayUniforms.uThermal.value,
      orbitalLayer === 'THERMAL' ? 1 : 0,
      lerpSpeed
    );
    overlayUniforms.uIce.value = THREE.MathUtils.lerp(
      overlayUniforms.uIce.value,
      orbitalLayer === 'ICE' ? 1 : 0,
      lerpSpeed
    );

    if (atmosMatRef.current) {
      if (orbitalLayer === 'ICE') targetAtmosColor.set('#38bdf8');
      else if (orbitalLayer === 'THERMAL') targetAtmosColor.set('#818cf8');
      else targetAtmosColor.set('#e07a5f');
      atmosMatRef.current.uniforms.uColor.value.lerp(targetAtmosColor, Math.min(1, dt * 4));
    }

    if (globeGroupRef.current && !hoveredSiteId && !selectedSiteId && !isDeploying) {
      globeGroupRef.current.rotation.y += dt * 0.03;
    }

    const activeSite = selectedSiteId
      ? LANDING_ZONES.find((z) => z.id === selectedSiteId)
      : null;

    if (globeGroupRef.current && activeSite) {
      globeGroupRef.current.updateMatrixWorld();
      const [lx, ly, lz] = latLonToVector3(activeSite.lat, activeSite.lon, GLOBE_RADIUS + 0.042);
      tempWorldBeacon.set(lx, ly, lz).applyMatrix4(globeGroupRef.current.matrixWorld);
      tempWorldNormal.copy(tempWorldBeacon).normalize();

      // Stage 2: Orbital-to-Beacon Atmospheric Plunge Dive
      if (isDeploying && !deployAnimRef.current.completed) {
        const anim = deployAnimRef.current;
        anim.elapsed += dt;
        const progress = Math.min(1, anim.elapsed / DEPLOY_DURATION_SEC);
        updateDeployProgress(progress);

        const pAlign = smoothstep(0.0, 0.55, progress);
        const qDelta = safeUnitRotation(anim.startDir, tempWorldNormal);
        tempQuat.slerpQuaternions(identQuat, qDelta, pAlign);
        tempCurDir.copy(anim.startDir).applyQuaternion(tempQuat).normalize();

        // Continuous two-stage descent: orbital radius (~8.9) -> entry (5.3895) -> beacon surface (3.4795)
        const rOrbitalToEntry = THREE.MathUtils.lerp(
          anim.startRadius,
          GLOBE_RADIUS + 2.0,
          smoothstep(0.0, 0.48, progress)
        );
        const radius = THREE.MathUtils.lerp(
          rOrbitalToEntry,
          GLOBE_RADIUS + 0.09,
          smoothstep(0.35, 1.0, progress)
        );

        camera.position.copy(tempCurDir).multiplyScalar(radius);

        // Aim cleanly toward surface point beneath beacon so look vector stays non-zero at impact
        const surfaceGoal = tempWorldNormal.clone().multiplyScalar(GLOBE_RADIUS * 0.96);
        tempLookTarget.lerpVectors(anim.startTarget, surfaceGoal, smoothstep(0.0, 0.65, progress));
        camera.lookAt(tempLookTarget);

        if (progress >= 1.0) {
          anim.completed = true;
          completeDeployToSurface();
        }
        return;
      }

      // Stage 1: Smooth Beacon Selection Slew along current orbital altitude
      if (slewRef.current.active) {
        const slew = slewRef.current;
        slew.elapsed += dt;
        const p = Math.min(1, slew.elapsed / SLEW_DURATION_SEC);
        const ease = 1 - Math.pow(1 - p, 3);

        const desiredDir = tempWorldNormal.clone().add(new THREE.Vector3(0, 0.08, 0)).normalize();
        const qDelta = safeUnitRotation(slew.startDir, desiredDir);
        tempQuat.slerpQuaternions(identQuat, qDelta, ease);
        tempCurDir.copy(slew.startDir).applyQuaternion(tempQuat).normalize();

        camera.position.copy(tempCurDir).multiplyScalar(slew.radius);
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }

        if (p >= 1) {
          slew.active = false;
        }
      }
    }
  });

  const activeAlbedo = marsTextures?.albedo || placeholderTex;
  const activeBump = marsTextures?.bump || placeholderTex;

  return (
    <>
      <color attach="background" args={['#030408']} />

      {/* Background Starfield rendered first with depthWrite={false} so stars never bleed through Mars */}
      <OrbitalStarfield />

      {/* Dramatic Orbital Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[6, 2, 5]} intensity={2.8} color="#fff1e4" />

      {/* Initial Y rotation centers Jezero, Gale & Arcadia on the front sunlit hemisphere */}
      <group ref={globeGroupRef} rotation={[0.12, Math.PI * 0.75, 0]}>
        <mesh renderOrder={1} onClick={() => !isDeploying && selectSite(null)}>
          <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
          <meshStandardMaterial
            key={marsTextures ? 'nasa-maps-loaded' : 'nasa-maps-init'}
            ref={marsMatRef}
            map={activeAlbedo}
            bumpMap={activeBump}
            bumpScale={0.12}
            displacementMap={activeBump}
            displacementScale={0.05}
            displacementBias={-0.025}
            roughness={0.86}
            metalness={0.04}
            transparent={false}
            depthWrite
            depthTest
            onBeforeCompile={handleBeforeCompile}
          />
        </mesh>

        {/* Warm Atmospheric Fresnel Limb Glow */}
        <mesh renderOrder={2} scale={1.06}>
          <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
          <shaderMaterial
            ref={atmosMatRef}
            vertexShader={ATMOS_VERTEX_SHADER}
            fragmentShader={ATMOS_FRAGMENT_SHADER}
            uniforms={atmosUniforms}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            transparent
            depthWrite={false}
          />
        </mesh>

        {/* 3 Real NASA Landing Site Beacons & Orbital Rover Yellow Landing + Green Highlighted Paths */}
        {LANDING_ZONES.map((site) => (
          <React.Fragment key={site.id}>
            <RoverOrbitalTrackOverlay
              site={site}
              highlighted={selectedSiteId === site.id || hoveredSiteId === site.id}
            />
            <LandingBeacon
              site={site}
              isSelected={selectedSiteId === site.id}
              isHovered={hoveredSiteId === site.id}
              isDeployingTarget={isDeploying && selectedSiteId === site.id}
              deployProgress={deployProgress}
              onSelect={(id) => !isDeploying && selectSite(id)}
              onHover={(id) => !isDeploying && setHoveredSite(id)}
            />
          </React.Fragment>
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        enabled={!isDeploying}
        onStart={() => {
          slewRef.current.active = false;
        }}
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        minDistance={5.25}
        maxDistance={12.7}
        rotateSpeed={0.55}
        zoomSpeed={0.8}
      />
    </>
  );
}
