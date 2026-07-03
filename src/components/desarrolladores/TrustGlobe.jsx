import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// TrustGlobe — globo 3D de puntos "tipo Stripe" para la sección de confianza de
// /desarrolladores/[slug]. NO es un fragment-shader fullscreen como las auroras
// del proyecto: aquí SÍ hay geometría 3D real (perspectiva/profundidad).
//   • Puntos distribuidos en espiral de Fibonacci sobre la esfera (no wireframe).
//   • ShaderMaterial propio: puntos circulares suaves + size attenuation por
//     profundidad + fresnel (borde de la esfera más tenue que el centro).
//   • 6 arcos great-circle con un pulso viajero (paquetes de datos, estilo Stripe).
//   • Auto-rotación Y lenta + tilt reactivo al mouse (lerp, tracking por window).
//   • Paleta navy/azul Cord (#5aa9ff / #93c5fd) sobre #08152a — SIN teal.
// ─────────────────────────────────────────────────────────────────────────────

const R = 1.0 // radio de la esfera

// ── Colores (lineales, se multiplican en el shader) ──────────────────────────
const COL_DOT   = new THREE.Color('#5aa9ff') // azul acento (coherente con .dvt-dot)
const COL_DOT2  = new THREE.Color('#93c5fd') // azul-blanco frío para variar
const COL_ARC   = new THREE.Color('#bcd9ff') // arcos: un poco más blancos
const COL_PULSE = new THREE.Color('#ffffff') // cresta del pulso: blanco

// ─── Esfera de Fibonacci ──────────────────────────────────────────────────────
function fibonacciSphere(n, radius) {
  const pts = []
  const phi = Math.PI * (3.0 - Math.sqrt(5.0)) // golden angle
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2 // -1 .. 1
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius))
  }
  return pts
}

// slerp entre dos puntos sobre la esfera (arco great-circle)
function slerpOnSphere(a, b, t, radius) {
  const na = a.clone().normalize()
  const nb = b.clone().normalize()
  let dot = THREE.MathUtils.clamp(na.dot(nb), -1, 1)
  const omega = Math.acos(dot)
  if (omega < 1e-4) return na.clone().multiplyScalar(radius)
  const so = Math.sin(omega)
  const s0 = Math.sin((1 - t) * omega) / so
  const s1 = Math.sin(t * omega) / so
  return na.clone().multiplyScalar(s0).add(nb.clone().multiplyScalar(s1)).multiplyScalar(radius)
}

// ─── Shaders de los puntos ────────────────────────────────────────────────────
const dotVert = /* glsl */`
  uniform float u_time;
  uniform float u_size;
  uniform float u_pixelRatio;
  attribute float a_rand;      // 0..1 por punto (variación de tamaño/brillo/twinkle)
  attribute float a_tone;      // 0..1 mezcla de color dot ↔ dot2
  varying float v_fres;        // fresnel (1 en el centro visto, 0 en el rim)
  varying float v_rand;
  varying float v_tone;
  varying float v_depth;

  void main() {
    v_rand = a_rand;
    v_tone = a_tone;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Normal del punto = su posición normalizada rotada a view-space.
    vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
    // La cámara mira -Z en view-space; el punto "de frente" tiene nrm.z ~ +1.
    v_fres = clamp(nrm.z, 0.0, 1.0);

    // profundidad normalizada para atenuar cara lejana (z más negativo = lejos)
    v_depth = clamp((mv.z + 3.6) / 2.6, 0.0, 1.0);

    // twinkle sutil por punto
    float tw = 0.82 + 0.18 * sin(u_time * 1.6 + a_rand * 40.0);

    gl_Position = projectionMatrix * mv;

    // size attenuation: más chico lejos + variación por punto + twinkle
    float sz = u_size * (0.55 + a_rand * 0.85) * tw;
    gl_PointSize = sz * u_pixelRatio * (1.0 / -mv.z);
  }
`

const dotFrag = /* glsl */`
  precision highp float;
  uniform vec3 u_dot;
  uniform vec3 u_dot2;
  varying float v_fres;
  varying float v_rand;
  varying float v_tone;
  varying float v_depth;

  void main() {
    // punto circular suave (no cuadrado): núcleo brillante + halo de glow
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.42, 0.06, d);        // núcleo nítido
    float halo = smoothstep(0.5, 0.0, d);          // glow amplio
    float alpha = clamp(core + halo * 0.6, 0.0, 1.0);
    if (alpha < 0.01) discard;

    // brillo: el frente (fresnel alto) brilla; el rim se apaga → lectura 3D
    // (piso más alto que antes: el lado lejano ya no se pierde tanto detrás
    // del vidrio esmerilado de las celdas)
    float front = 0.62 + 0.95 * pow(v_fres, 0.9);
    // atenuación por profundidad (cara lejana más tenue, pero aún visible)
    float depthDim = mix(0.68, 1.0, v_depth);

    vec3 col = mix(u_dot, u_dot2, v_tone);
    // el núcleo va brillante (blanquea un poco hacia el centro del punto);
    // el halo aporta el "bloom" azul suave
    vec3 lit = col * front * depthDim;
    lit += mix(col, vec3(1.0), 0.3) * core * 0.7 * front;      // realce del núcleo
    lit += vec3(0.22, 0.40, 0.72) * halo * 0.85 * depthDim;    // bloom azul

    gl_FragColor = vec4(lit, alpha);
  }
`

// ─── Shaders de los arcos ─────────────────────────────────────────────────────
const arcVert = /* glsl */`
  attribute float a_t;     // 0..1 posición a lo largo del arco
  attribute float a_arc;   // índice del arco (para desfasar los pulsos)
  varying float v_t;
  varying float v_arc;
  varying float v_fres;
  void main() {
    v_t = a_t;
    v_arc = a_arc;
    vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
    v_fres = clamp(nrm.z, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const arcFrag = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec3  u_arc;
  uniform vec3  u_pulse;
  varying float v_t;
  varying float v_arc;
  varying float v_fres;

  void main() {
    // línea base del arco (más visible cerca del centro de la esfera) — subida
    // para que la red se lea incluso sin el pulso viajero encima
    float base = 0.24 + 0.34 * v_fres;

    // pulso viajero: una gaussiana en head que recorre a_t de 0→1 en loop,
    // desfasada por arco. head sale de fuera de rango para dar "espera" entre pulsos.
    float speed = 0.32;
    float cycle = 2.6;
    float phase = fract(u_time * speed + v_arc * 0.37);
    float head  = phase * (1.0 + 0.25) - 0.125; // recorre ligeramente fuera de [0,1]
    float dist  = v_t - head;
    // estela: brillante en la cabeza, cae hacia atrás
    float trail = exp(-max(dist, 0.0) * 9.0) * 0.85 + exp(-abs(dist) * 22.0);
    trail = clamp(trail, 0.0, 1.2);

    // el pulso también se atenúa en la cara lejana
    float depthMask = 0.32 + 0.68 * v_fres;

    vec3 col = u_arc * base;
    col += u_pulse * trail * depthMask;

    float alpha = clamp(base + trail * depthMask, 0.0, 1.0);
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Atmósfera / cuerpo de la esfera ──────────────────────────────────────────
// Un shell translúcido con fresnel: aporta "presencia" de globo (un halo azul
// en el borde) sin tapar los puntos. Renderiza el interior (BackSide) para que el
// glow quede detrás de los puntos y en el rim.
const atmoVert = /* glsl */`
  varying vec3 v_nrm;
  varying vec3 v_view;
  void main() {
    v_nrm = normalize(mat3(modelViewMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    v_view = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const atmoFrag = /* glsl */`
  precision highp float;
  uniform vec3 u_glow;
  varying vec3 v_nrm;
  varying vec3 v_view;
  void main() {
    float fres = pow(1.0 - abs(dot(v_nrm, v_view)), 2.2);
    float alpha = fres * 0.68;
    // núcleo interior tenue (da cuerpo, no un aro hueco) — un poco más presente
    float core = (1.0 - fres) * 0.09;
    gl_FragColor = vec4(u_glow * (fres * 1.1 + 0.14), alpha + core);
  }
`
function GlobeAtmosphere() {
  const uniforms = useMemo(() => ({
    u_glow: { value: new THREE.Color('#2b6fd6') },
  }), [])
  return (
    <mesh scale={1.09}>
      <sphereGeometry args={[R, 48, 48]} />
      <shaderMaterial
        vertexShader={atmoVert}
        fragmentShader={atmoFrag}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ─── Puntos de la esfera ──────────────────────────────────────────────────────
function GlobeDots({ count = 1400 }) {
  const matRef = useRef()

  const { geometry, spherePts } = useMemo(() => {
    const spherePts = fibonacciSphere(count, R)
    const positions = new Float32Array(count * 3)
    const rand = new Float32Array(count)
    const tone = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = spherePts[i].x
      positions[i * 3 + 1] = spherePts[i].y
      positions[i * 3 + 2] = spherePts[i].z
      rand[i] = Math.random()
      tone[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('a_rand', new THREE.BufferAttribute(rand, 1))
    g.setAttribute('a_tone', new THREE.BufferAttribute(tone, 1))
    return { geometry: g, spherePts }
  }, [count])

  const uniforms = useMemo(() => ({
    u_time:        { value: 0 },
    u_size:        { value: 16.0 },
    u_pixelRatio:  { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.5) },
    u_dot:         { value: COL_DOT.clone() },
    u_dot2:        { value: COL_DOT2.clone() },
  }), [])

  useFrame(({ clock }) => {
    if (matRef.current) uniforms.u_time.value = clock.getElapsedTime()
  })

  // exponer los puntos para que los arcos elijan pares
  GlobeDots._pts = spherePts

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={dotVert}
        fragmentShader={dotFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ─── Arcos great-circle con pulso viajero ─────────────────────────────────────
function GlobeArcs({ pairs = 6, segments = 64 }) {
  const matRef = useRef()

  const geometry = useMemo(() => {
    // pares de puntos "interesantes" (bien separados) sobre la esfera
    const pick = () => {
      const a = new THREE.Vector3().randomDirection().multiplyScalar(R)
      let b
      do {
        b = new THREE.Vector3().randomDirection().multiplyScalar(R)
      } while (a.clone().normalize().dot(b.clone().normalize()) > 0.35) // asegurar separación
      return [a, b]
    }

    const positions = []
    const aT = []
    const aArc = []
    const indices = []
    let vOffset = 0

    for (let p = 0; p < pairs; p++) {
      const [a, b] = pick()
      for (let s = 0; s <= segments; s++) {
        const t = s / segments
        // slerp sobre la superficie + un pequeño "arco" radial hacia afuera
        // (más alto a medio camino) → el trazo se despega de la esfera.
        const pos = slerpOnSphere(a, b, t, R)
        const bulge = Math.sin(t * Math.PI) * 0.16
        pos.setLength(R + bulge)
        positions.push(pos.x, pos.y, pos.z)
        aT.push(t)
        aArc.push(p)
        if (s < segments) {
          indices.push(vOffset + s, vOffset + s + 1)
        }
      }
      vOffset += segments + 1
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('a_t', new THREE.Float32BufferAttribute(aT, 1))
    g.setAttribute('a_arc', new THREE.Float32BufferAttribute(aArc, 1))
    g.setIndex(indices)
    return g
  }, [pairs, segments])

  const uniforms = useMemo(() => ({
    u_time:  { value: 0 },
    u_arc:   { value: COL_ARC.clone() },
    u_pulse: { value: COL_PULSE.clone() },
  }), [])

  useFrame(({ clock }) => {
    if (matRef.current) uniforms.u_time.value = clock.getElapsedTime()
  })

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={arcVert}
        fragmentShader={arcFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  )
}

// ─── Grupo giratorio + tilt reactivo al mouse ────────────────────────────────
function GlobeScene({ reduced }) {
  const groupRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0, 0))
  const mouseSmooth = useRef(new THREE.Vector2(0, 0))

  useEffect(() => {
    if (reduced) return
    const onMove = (e) => {
      mouseTarget.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      )
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [reduced])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    // tilt suave hacia el cursor
    mouseSmooth.current.lerp(mouseTarget.current, 0.045)
    if (!reduced) {
      g.rotation.y += delta * 0.12 // auto-rotación Y lenta
    }
    // parallax/tilt: inclina un poco hacia el mouse (sobre la rotación base)
    g.rotation.x = -0.28 + mouseSmooth.current.y * 0.18
    g.rotation.z = mouseSmooth.current.x * 0.06
  })

  // ligera inclinación inicial para que se vea "3D" desde el primer frame
  return (
    <group ref={groupRef} rotation={[-0.28, reduced ? 0.6 : 0, 0]}>
      <GlobeAtmosphere />
      <GlobeDots />
      <GlobeArcs />
    </group>
  )
}

// ─── Componente exportable ────────────────────────────────────────────────────
export default function TrustGlobe() {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [frameloop, setFrameloop] = useState('always')

  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Fade-in tras montar (evita flash inicial)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Pausa el render loop fuera del viewport
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    if (reduced) { setFrameloop('demand'); return }
    const io = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? 'always' : 'never'),
      { threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.9s ease',
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 2.6], fov: 42, near: 0.1, far: 100 }}
        frameloop={reduced ? 'demand' : frameloop}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
          preserveDrawingBuffer: false,
        }}
        style={{ pointerEvents: 'none', background: 'transparent' }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
      >
        <GlobeScene reduced={reduced} />
      </Canvas>
    </div>
  )
}
