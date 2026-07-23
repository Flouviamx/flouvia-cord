import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const fragmentShader = `
uniform float u_time;
uniform float u_aspect;
varying vec2 vUv;

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= u_aspect;
    
    float r = length(p);
    float a = atan(p.y, p.x);
    
    float time = u_time * 0.05; // Extremely slow and elegant
    
    vec2 pWarp = p + 0.15 * vec2(
        sin(time * 0.8 + p.y * 4.0),
        cos(time * 0.9 + p.x * 4.0)
    );
    
    float rWarp = length(pWarp);
    float aWarp = atan(pWarp.y, pWarp.x);
    
    float f1 = sin(rWarp * 60.0 + sin(aWarp * 8.0 + time * 1.5) * 2.5 - time * 2.0);
    float f2 = cos(rWarp * 55.0 - cos(aWarp * 12.0 - time * 1.2) * 2.0 + time * 1.8);
    float f3 = sin(rWarp * 40.0 + sin(aWarp * 5.0 - time) * 3.0);
    
    float pattern = f1 * f2 + f3 * 0.5;
    
    // Sub-pixel thickness (extremely crisp and thin)
    float lineAlpha = smoothstep(0.025, 0.0, abs(pattern));
    
    // Platinum gray (subtle, high engineering look)
    vec3 color = vec3(0.55, 0.58, 0.62); 
    
    // Elegant fade out
    float mask = smoothstep(1.4, 0.1, r);
    
    gl_FragColor = vec4(color, lineAlpha * mask * 0.75);
}
`;

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const Scene = () => {
  const { viewport, size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useRef({
    u_time: { value: 0 },
    u_aspect: { value: 1 },
  });

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      // Prevent NaN which would completely break the shader silently
      const aspect = (size.width && size.height) ? (size.width / size.height) : 1;
      materialRef.current.uniforms.u_aspect.value = aspect;
    }
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        attach="material"
        ref={materialRef}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms.current}
        transparent={true}
        depthWrite={false}
      />
    </mesh>
  );
};

export default function GuillocheHero() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = React.useState(true)
  const [reduced] = React.useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  React.useEffect(() => {
    if (!wrapRef.current) return
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: '140px' },
    )
    io.observe(wrapRef.current)
    return () => io.disconnect()
  }, [])

  if (reduced) return null

  return (
    <div ref={wrapRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        camera={{ position: [0, 0, 1] }}
        gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
        dpr={1}
        frameloop={onScreen ? 'always' : 'never'}
      >
        <Scene />
      </Canvas>
    </div>
  );
}

