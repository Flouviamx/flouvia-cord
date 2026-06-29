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

// Quantized Gradient Wave — modo claro, barras verticales escalonadas (floor)
// que forman una onda expansiva; reacciona magnéticamente al mouse.
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  varying vec2  vUv;

  const float bands = 80.0;

  // Hash para dither (rompe el banding de los gradientes pastel)
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Altura de la onda. layer=0 onda principal · layer=1 onda de fondo (parallax)
  float waveHeight(float cx, float layer) {
    // la capa de fondo sigue al mouse con menos fuerza y va más lenta
    float follow = mix(0.55, 0.32, layer);
    float tScale = mix(1.0, 0.65, layer);
    float t = u_time * tScale;

    float peakX = mix(0.5, u_mouse.x, follow);
    float wWidth = mix(0.34, 0.46, layer);
    float dxp   = (cx - peakX) / wWidth;
    float bell  = exp(-dxp * dxp);

    float breathe = 0.5 + 0.5 * sin(t * 0.55 + layer * 1.7);
    float ripple  = 0.05 * sin(cx * 16.0 + t * 0.8 + layer * 2.1)
                  + 0.03 * sin(cx * 31.0 - t * 0.5);

    float magnet = exp(-abs(cx - u_mouse.x) * 7.0) * mix(0.30, 0.16, layer);

    float baseH = mix(0.16, 0.26, layer);
    float amp   = mix(0.46, 0.30, layer);
    float h = baseH + bell * (amp + 0.16 * breathe) + ripple + magnet;
    return clamp(h, 0.04, 0.95);
  }

  void main() {
    vec2 uv = vUv;  // (0,0)=abajo-izq  (1,1)=arriba-der

    // ── Estructura de columnas, pero con altura INTERPOLADA entre vecinas ──
    // (mantiene la base "cuantizada" sin que se vean escalones rectangulares)
    float fx       = uv.x * bands;
    float colIndex = floor(fx);
    float fpart     = fract(fx);
    float qx       = (colIndex + 0.5) / bands;   // centro de columna (para color)

    // Centros de la columna actual y la siguiente → lerp suave del tope
    float cxA = (colIndex + 0.5) / bands;
    float cxB = (colIndex + 1.5) / bands;
    float ease = smoothstep(0.0, 1.0, fpart);

    // Capa principal + capa de fondo (parallax), ambas interpoladas
    float h  = mix(waveHeight(cxA, 0.0), waveHeight(cxB, 0.0), ease);
    float hB = mix(waveHeight(cxA, 1.0), waveHeight(cxB, 1.0), ease);

    float mDist = abs(qx - u_mouse.x);

    // ── Paleta modo claro premium (azul + verde claritos) ─────────────────
    vec3 white     = vec3(1.000, 1.000, 1.000);
    vec3 lightBlue = vec3(0.792, 0.910, 0.992); // azul cielo claro #cae8fd
    vec3 lightGreen= vec3(0.800, 0.945, 0.875); // verde menta claro #ccf1df
    vec3 softTop   = vec3(0.965, 0.984, 0.992); // casi blanco frío

    // Mezcla horizontal: las columnas transitan suave entre verde y azul
    float hueMix = 0.5 + 0.5 * sin(qx * 5.0 + u_time * 0.25);
    vec3 baseCol = mix(lightGreen, lightBlue, hueMix);

    float edge = 0.045;

    // ── Capa de fondo (más pálida, da profundidad) ────────────────────────
    float fillB = smoothstep(hB + 0.07, hB - 0.07, uv.y);
    vec3  bgCol = mix(white, mix(baseCol, white, 0.55), fillB * 0.6);
    vec3  color = bgCol;

    // ── Capa principal ────────────────────────────────────────────────────
    float fill = smoothstep(h + edge, h - edge, uv.y);
    float yN   = clamp(uv.y / max(h, 0.001), 0.0, 1.0);
    vec3  barCol = mix(baseCol, softTop, smoothstep(0.30, 1.0, yN));

    // Shimmer: destello vertical que recorre las barras lentísimo
    float shimmer = smoothstep(0.86, 1.0, sin(qx * 7.0 - u_time * 0.6) * 0.5 + 0.5);
    barCol = mix(barCol, white, shimmer * 0.18 * fill);

    color = mix(color, barCol, fill);

    // ── Glow suave SOBRE la cresta (luz que se escapa hacia arriba) ────────
    float aboveTop = smoothstep(h + 0.14, h, uv.y) * step(uv.y, h + 0.14);
    float crestGlow = aboveTop * (0.10 + exp(-mDist * 5.0) * 0.18);
    color = mix(color, baseCol, crestGlow * 0.5);

    // Halo de color sobre la cresta cerca del cursor
    float crest = fill * exp(-mDist * 6.0) * 0.10;
    color = mix(color, baseCol, crest);

    // ── Dither: rompe el banding de los gradientes (truco premium) ─────────
    color += (hash(uv * u_resolution.xy) - 0.5) * 0.006;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

function WavePlane() {
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

  // Lerp bajo = reacción elástica/fluida al mouse
  useFrame(({ clock, size }) => {
    uniforms.u_time.value = clock.getElapsedTime()
    uniforms.u_resolution.value.set(size.width, size.height)
    mouseSmooth.current.lerp(mouseTarget.current, 0.06)
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

export default function QuantizedWaveBg() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <WavePlane />
    </Canvas>
  )
}
