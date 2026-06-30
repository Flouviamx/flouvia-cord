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

// Green Ramp — modo claro "Quiet Luxury". Barras verticales sólidas (floor → corte
// limpio, sin difuminado horizontal) que crecen en diagonal de izq → der. La diagonal
// respira lentísimo (ecualizador pesado) y reacciona magnéticamente al cursor.
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  varying vec2  vUv;

  // ~13 barras verticales perfectas
  const float bands = 13.0;

  void main() {
    vec2 uv = vUv;  // (0,0)=abajo-izq · (1,1)=arriba-der

    // ── Cuantización: corte limpio (stepped), sin lerp entre barras ──────────
    float colIndex = floor(uv.x * bands);
    float cx       = (colIndex + 0.5) / bands;   // centro de la columna (0..1)

    // ── La diagonal: la altura crece linealmente de izq → der ────────────────
    float ramp = mix(0.16, 0.82, cx);

    // ── Respiración autónoma (multiplicador bajo → lentísimo, fluido) ────────
    // Onda que recorre la rampa como ecualizador pesado.
    float t = u_time * 0.18;
    float breathe = 0.045 * sin(cx * 4.5 + t)
                  + 0.030 * sin(cx * 9.0 - t * 0.7);

    // ── Interacción magnética: distancia en X cursor ↔ barra ─────────────────
    // Cae suave con la distancia; el regreso a reposo lo da la inercia del lerp
    // sobre u_mouse en JS (física elástica).
    float mDist  = abs(cx - u_mouse.x);
    float magnet = exp(-mDist * mDist * 90.0);   // halo angosto sobre 1-2 barras
    float lift   = magnet * 0.10;                // se eleva ligeramente

    float h = clamp(ramp + breathe + lift, 0.0, 0.98);

    // ── Paleta verde corporativa súper suave (sage/menta) ────────────────────
    vec3 white = vec3(1.000, 1.000, 1.000);
    vec3 sage  = vec3(0.776, 0.871, 0.808);  // verde salvia suave (base de la barra)
    vec3 mint  = vec3(0.886, 0.953, 0.910);  // menta clarísimo (tope, casi blanco)

    // Corte limpio de la barra (borde levemente suavizado solo 1px, anti-alias).
    float edge = 1.5 / u_resolution.y;
    float fill = smoothstep(h + edge, h - edge, uv.y);

    // Gradiente vertical dentro de la barra: salvia abajo → menta/blanco arriba.
    float yN     = clamp(uv.y / max(h, 0.001), 0.0, 1.0);
    vec3  barCol = mix(sage, mint, smoothstep(0.0, 1.0, yN));
    // El último tramo se funde a blanco para "desvanecer" hacia arriba.
    barCol = mix(barCol, white, smoothstep(0.72, 1.0, yN));

    // Cerca del cursor el verde se ilumina un toque (sin chillar).
    barCol = mix(barCol, sage, magnet * 0.18 * fill);

    vec3 color = mix(white, barCol, fill);

    // Fade to white en la parte inferior para fusionarse con el fondo HTML
    float bottomFade = smoothstep(0.3, 0.0, uv.y);
    color = mix(color, white, bottomFade);

    // Dither sutil para romper el banding del pastel.
    float dither = fract(sin(dot(uv * u_resolution.xy, vec2(127.1, 311.7))) * 43758.5453);
    color += (dither - 0.5) * 0.004;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

function RampPlane() {
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))
  const isHovering = useRef(false)
  const hoverTimeout = useRef(null)

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(800, 600) },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
  }), [])

  useEffect(() => {
    const handleInteract = (clientX, clientY) => {
      isHovering.current = true
      mouseTarget.current.set(
        clientX / window.innerWidth,
        1.0 - clientY / window.innerHeight,
      )
      clearTimeout(hoverTimeout.current)
      hoverTimeout.current = setTimeout(() => {
        isHovering.current = false
      }, 2500)
    }

    const onMove = (e) => handleInteract(e.clientX, e.clientY)
    const onTouch = (e) => {
      if (e.touches.length > 0) {
        handleInteract(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchstart', onTouch)
      clearTimeout(hoverTimeout.current)
    }
  }, [])

  // Lerp bajo → inercia/regreso elástico al soltar el cursor
  useFrame(({ clock, size }) => {
    const time = clock.getElapsedTime()
    uniforms.u_time.value = time
    uniforms.u_resolution.value.set(size.width, size.height)
    
    if (!isHovering.current) {
      // Movimiento orgánico autónomo para móviles o inactividad
      mouseTarget.current.x = 0.5 + Math.sin(time * 0.4) * 0.3 + Math.sin(time * 0.65) * 0.1
      mouseTarget.current.y = 0.5 + Math.cos(time * 0.3) * 0.3
    }
    
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

export default function GreenRampShader() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <RampPlane />
    </Canvas>
  )
}
