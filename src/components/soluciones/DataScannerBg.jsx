import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Misma FORMA que el reference (corona de columnas, alturas variables)
// pero en modo claro: fondo blanco, columnas en azul/teal/lavanda
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  varying vec2  vUv;

  void main() {
    vec2  uv = vUv;   // (0,0)=bottom-left  (1,1)=top-right
    float t  = u_time * 0.45;

    // Pulso global: toda la corona sube y baja — de 20% a 100% de altura (~13s)
    float globalBreath = 0.20 + 0.80 * (0.5 + 0.5 * sin(u_time * 0.48));

    // Fondo: blanco casi puro
    vec3 bg = vec3(0.99, 0.99, 1.00);

    // Colores de las columnas (se mezclan verticalmente)
    // Base (suelo) → medio → punta
    vec3 cBase   = vec3(0.65, 0.80, 0.99); // azul cielo saturado
    vec3 cMid    = vec3(0.70, 0.65, 0.97); // lavanda
    vec3 cTip    = vec3(0.52, 0.88, 0.82); // teal esmeralda

    float totalW = 0.0;
    vec3  totalC = vec3(0.0);

    const int   N     = 14;
    const float fN    = 14.0;
    const float sigma = 0.056;

    for (int i = 0; i < N; i++) {
      float fi    = float(i);
      float phase = fi * 0.61803;  // ratio áureo → fase única por columna

      // Centro X
      float cx = (fi + 0.5) / fN;

      // Crown: columnas centrales MUY altas, bordes MUY cortas
      float dist01 = abs(cx - 0.5) * 2.0;
      float crown  = max(0.0, 1.0 - pow(dist01, 1.5));

      // Altura: corona global que sube/baja + oscilación individual por columna
      float h = (0.16 + crown * 0.74 + 0.08 * sin(t * 0.85 + phase * 6.2831)) * globalBreath;
      h = clamp(h, 0.02, 0.96);

      // ── Gaussiana horizontal ──────────────────────────────────────────
      float dx = uv.x - cx;
      float w  = exp(-(dx * dx) / (2.0 * sigma * sigma));

      // ── Perfil vertical: sube del suelo, se apaga sobre la punta ─────
      float vRise = 1.0 - exp(-uv.y * 18.0);
      float vTip  = exp(-max(0.0, uv.y - h) * 22.0);
      float vFade = vRise * vTip;

      // Brillo: centro más intenso + boost del mouse
      float mouseBoost = exp(-abs(uv.x - u_mouse.x) * 5.0) * 0.28;
      float bright = 0.30 + crown * 0.70 + mouseBoost;

      float intensity = w * vFade * bright;

      // Color varía de base a punta (igual que reference pero colores claros)
      float yN   = clamp(uv.y / max(h, 0.01), 0.0, 1.0);
      vec3 beamC = mix(cBase, cMid, smoothstep(0.0,  0.55, yN));
      beamC      = mix(beamC, cTip, smoothstep(0.40, 0.90, yN));

      totalW += intensity;
      totalC += beamC * intensity;
    }

    // Mezcla: fondo blanco → color de columnas
    vec3  beamColor = totalW > 0.001 ? totalC / totalW : bg;
    // Intensidad máxima: 42% → claramente visible sin tapar el texto negro
    float alpha     = clamp(totalW * 0.80, 0.0, 0.42);
    vec3  color     = mix(bg, beamColor, alpha);

    // Suave "poza de color" en la base (eco del suelo rosa del reference, aquí teal)
    float basePool = pow(max(0.0, 1.0 - uv.y * 4.5), 2.0);
    color = mix(color, cBase, basePool * 0.14);

    // Viñeta horizontal ligera (profundidad en bordes)
    float vx  = (uv.x - 0.5) * 2.0;
    float vig = 1.0 - 0.18 * vx * vx;
    color *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

function BeamPlane() {
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(800, 600) },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
  }), [])

  useEffect(() => {
    const onMove = (e) => {
      mouseTarget.current.set(
        e.clientX / window.innerWidth,
        1.0 - e.clientY / window.innerHeight,
      )
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame(({ clock, size }) => {
    uniforms.u_time.value       = clock.getElapsedTime()
    uniforms.u_resolution.value.set(size.width, size.height)
    mouseSmooth.current.lerp(mouseTarget.current, 0.04)
    uniforms.u_mouse.value.copy(mouseSmooth.current)
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function DataScannerBg() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <BeamPlane />
    </Canvas>
  )
}
