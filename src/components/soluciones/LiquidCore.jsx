import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';

export default function LiquidCore() {
  return (
    <div style={{ width: '500px', height: '500px', margin: '0 auto', maxWidth: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 3] }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.5} />
        
        {/* Luz fría sutil desde arriba/derecha para darle el tono Apple */}
        <directionalLight position={[5, 5, 5]} intensity={1.5} color="#dbeafe" />
        
        {/* Luz cálida tenue desde abajo/izquierda para contraste y volumen */}
        <directionalLight position={[-5, -5, 2]} intensity={1.0} color="#fef4ef" />
        
        <Float 
            speed={2} 
            rotationIntensity={0.5} 
            floatIntensity={1.5} 
            floatingRange={[-0.1, 0.1]}
        >
          <Sphere args={[1, 128, 128]}>
            <MeshDistortMaterial
              color="#ffffff"
              roughness={0.1}
              metalness={0.8}
              distort={0.4}
              speed={1.5}
            />
          </Sphere>
        </Float>
      </Canvas>
    </div>
  );
}
