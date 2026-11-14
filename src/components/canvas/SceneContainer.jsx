import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useMissionStore } from '../../store/useMissionStore';
import OrbitGlobe from './OrbitGlobe';
import SurfaceEVA from './SurfaceEVA';

export default function SceneContainer() {
  const viewMode = useMissionStore((s) => s.viewMode);

  return (
    <div className="fixed inset-0 z-0 h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 55, near: 0.1, far: 400, position: [0, 1.44, 8.9] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          {viewMode === 'ORBIT' ? <OrbitGlobe /> : <SurfaceEVA />}
        </Suspense>
      </Canvas>
    </div>
  );
}
