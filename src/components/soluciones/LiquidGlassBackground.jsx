import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const fragmentShader = `
uniform float u_time;
uniform float u_aspect;
varying vec2 vUv;

// Simplex 3D Noise (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Generamos un mapa de altura suave sumando frecuencias de ruido
float heightMap(vec2 uv, float t) {
    float h = snoise(vec3(uv * 1.5, t * 0.4)) * 0.6;
    h += snoise(vec3(uv * 3.0, t * 0.6)) * 0.3;
    h += snoise(vec3(uv * 6.0, t * 0.8)) * 0.1;
    return h;
}

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= u_aspect;
    
    // Movimiento extremadamente lento de líquido espeso
    float t = u_time * 0.15;
    
    // Calcular derivadas (normales) muestreando puntos vecinos
    float eps = 0.01; // Distancia delta
    float h = heightMap(p, t);
    float hx = heightMap(p + vec2(eps, 0.0), t);
    float hy = heightMap(p + vec2(0.0, eps), t);
    
    // Gradiente y vector normal
    // Multiplicamos el gradiente por un factor para exagerar o suavizar la refracción
    float bumpiness = 0.8; 
    vec3 normal = normalize(vec3(-(hx - h) * bumpiness / eps, -(hy - h) * bumpiness / eps, 1.0));
    
    // Direcciones de cámara y luz
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    // Luz sutil desde arriba a la izquierda
    vec3 lightDir = normalize(vec3(-1.0, 1.0, 0.8)); 
    
    // Modelo de iluminación Blinn-Phong hiper suave
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Specular (Brillo intenso del vidrio)
    vec3 halfVector = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVector), 0.0), 64.0); // Muy brillante
    
    // Colores: Blanco puro y Gris Perla muy sutil (#f8f9fa aprox)
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 pearlShadow = vec3(0.97, 0.976, 0.98); 
    
    // Mezcla base
    // Si la superficie apunta a la luz es blanca, si no, se asoma el gris perla.
    float diffuseIntensity = smoothstep(0.2, 0.8, diff);
    vec3 finalColor = mix(pearlShadow, white, diffuseIntensity);
    
    // Sumar el especular (brillo cristalino)
    finalColor = mix(finalColor, white, spec * 0.8);
    
    // La opacidad baja hace que el efecto sea un velo casi imperceptible 
    // sobre el fondo de la página web
    gl_FragColor = vec4(finalColor, 0.65);
}
`;

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GlassScene = () => {
  const { viewport, size } = useThree();
  const materialRef = useRef();

  const uniforms = useRef({
    u_time: { value: 0 },
    u_aspect: { value: 1 },
  });

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      const aspect = (size.width && size.height) ? (size.width / size.height) : 1;
      materialRef.current.uniforms.u_aspect.value = aspect;
    }
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      {/* Geometría que cubre toda la vista */}
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

export default function LiquidGlassBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        camera={{ position: [0, 0, 1] }}
        gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
        dpr={[1, 2]}
      >
        <GlassScene />
      </Canvas>
    </div>
  );
}
