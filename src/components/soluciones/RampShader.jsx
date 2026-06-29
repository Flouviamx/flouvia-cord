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

// Ramp — modo claro "Quiet Luxury". Barras verticales sólidas (floor → corte
// limpio, sin difuminado horizontal) que crecen en diagonal de izq → der. La
// paleta de las barras llega por uniforms (u_base abajo · u_top arriba) para
// reusar el mismo shader con distintos colores por página.
// Capas premium: cordillera de PARALLAX detrás (banda distinta, más pálida y
// lenta → da profundidad), glow de cresta sobre los topes, specular de 1px en el
// borde superior, shimmer viajero horizontal y dither anti-banding. Todo respira
// con ondas senoidales desfasadas y reacciona magnéticamente al cursor.
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  uniform vec3  u_base;   // color base de la barra (abajo)
  uniform vec3  u_top;    // color del tope (casi blanco)
  varying vec2  vUv;

  const float bands  = 13.0;   // barras del frente
  const float bandsB = 8.0;    // cordillera de fondo (más anchas → parallax)

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;                       // (0,0)=abajo-izq · (1,1)=arriba-der
    float edge = 1.5 / u_resolution.y;   // anti-alias del corte (1px)
    float t = u_time * 0.18;

    vec3 white = vec3(1.0);
    vec3 color = white;

    // ── Capa de fondo (parallax): cordillera distante, pálida y lenta ────────
    float colB = floor(uv.x * bandsB);
    float cxB  = (colB + 0.5) / bandsB;
    float rampB = mix(0.34, 0.60, cxB);
    rampB += 0.05 * sin(cxB * 6.0 + t * 0.6)
           + 0.035 * sin(cxB * 11.0 - t * 0.4 + 1.7);
    float hB    = clamp(rampB, 0.0, 0.96);
    float fillB = smoothstep(hB + edge, hB - edge, uv.y);
    vec3  backCol = mix(u_base, white, 0.58);                  // pálida (lejana)
    float yNB   = clamp(uv.y / max(hB, 0.001), 0.0, 1.0);
    backCol = mix(backCol, white, smoothstep(0.5, 1.0, yNB));  // se funde arriba
    color = mix(color, backCol, fillB * 0.85);

    // ── Capa frontal: la diagonal protagonista ───────────────────────────────
    float colIndex = floor(uv.x * bands);
    float cx       = (colIndex + 0.5) / bands;

    float ramp = mix(0.16, 0.80, cx);
    float breathe = 0.045 * sin(cx * 4.5 + t)
                  + 0.030 * sin(cx * 9.0 - t * 0.7);

    // Interacción magnética: el cursor eleva 1-2 barras y las ilumina.
    float mDist  = abs(cx - u_mouse.x);
    float magnet = exp(-mDist * mDist * 70.0);
    float lift   = magnet * 0.10;

    float h    = clamp(ramp + breathe + lift, 0.0, 0.98);
    float fill = smoothstep(h + edge, h - edge, uv.y);

    // Gradiente vertical: base abajo → tope → blanco (desvanece hacia arriba).
    float yN     = clamp(uv.y / max(h, 0.001), 0.0, 1.0);
    vec3  barCol = mix(u_base, u_top, smoothstep(0.0, 1.0, yN));
    barCol = mix(barCol, white, smoothstep(0.72, 1.0, yN));

    // Shimmer viajero: una luz tenue recorre las crestas horizontalmente.
    float shimX = fract(u_time * 0.05);
    float shim  = exp(-pow(cx - shimX, 2.0) * 50.0);
    barCol = mix(barCol, white, shim * 0.16 * smoothstep(0.4, 1.0, yN));

    // Cerca del cursor el color se satura un toque (sin chillar).
    barCol = mix(barCol, u_base, magnet * 0.16 * fill);

    // Specular de cresta: línea fina y brillante en el borde superior.
    float crest = smoothstep(h - 0.012, h - 0.002, uv.y) * step(uv.y, h);
    barCol = mix(barCol, white, crest * 0.45);

    color = mix(color, barCol, fill);

    // ── Glow de cresta: bloom suave de color sobre los topes (más bajo cursor)
    float gd   = uv.y - h;
    float glow = exp(-gd * gd * 700.0) * step(0.0, gd);
    glow *= (0.05 + magnet * 0.10);
    color = mix(color, u_base, glow);

    // ── Dither anti-banding (rompe los escalones del pastel) ─────────────────
    float dither = hash(uv * u_resolution.xy);
    color += (dither - 0.5) * 0.005;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

function RampPlane({ base, top }) {
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(800, 600) },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
    u_base:       { value: new THREE.Vector3(...base) },
    u_top:        { value: new THREE.Vector3(...top) },
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

  // Lerp bajo → inercia/regreso elástico al soltar el cursor
  useFrame(({ clock, size }) => {
    uniforms.u_time.value = clock.getElapsedTime()
    uniforms.u_resolution.value.set(size.width, size.height)
    mouseSmooth.current.lerp(mouseTarget.current, 0.05)
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

// Paletas pastel (RGB 0..1) por variante.
const PALETTES = {
  green:  { base: [0.776, 0.871, 0.808], top: [0.886, 0.953, 0.910] }, // sage/menta
  blue:   { base: [0.737, 0.839, 0.957], top: [0.882, 0.929, 0.984] }, // cielo suave
  azure:  { base: [0.580, 0.733, 0.945], top: [0.788, 0.878, 0.980] }, // azul más fuerte
  purple: { base: [0.792, 0.741, 0.949], top: [0.898, 0.867, 0.980] }, // lila
}

export default function RampShader({ variant = 'green' }) {
  const palette = PALETTES[variant] || PALETTES.green
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <RampPlane base={palette.base} top={palette.top} />
    </Canvas>
  )
}
