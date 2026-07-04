import { useRef, useMemo, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// TrustGlobe — globo interactivo estilo Stripe.
//   • Textura de tierra precisa (puntos sólo en los continentes).
//   • Océano reemplazado por un aura/aurora azul claro sutil.
//   • 18,000 puntos para súper alta definición.
//   • Interactivo: OrbitControls para arrastrar y mover con el mouse.
// ─────────────────────────────────────────────────────────────────────────────

const R = 1.0

const EARTH_MASK_URL = 'https://unpkg.com/three-globe/example/img/earth-water.png'

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180
  // Prime Meridian (lon=0) at +Z. East (lon=90) at +X.
  const theta = lon * Math.PI / 180
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta),
  )
}

function fibonacciSphere(n, radius) {
  const positions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const rands = new Float32Array(n)
  
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    
    positions[i * 3] = x * radius
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = z * radius
    
    // Calcular lat/lon consistentes con latLonToVec3
    const lat = Math.asin(THREE.MathUtils.clamp(y, -1, 1))
    const lon = Math.atan2(x, z) // atan2(x, z) para mapear X=East, Z=Greenwich
    
    // UV map estándar: Greenwich en el centro (0.5)
    uvs[i * 2] = (lon + Math.PI) / (2 * Math.PI)
    uvs[i * 2 + 1] = (lat + Math.PI / 2) / Math.PI
    
    rands[i] = Math.random()
  }
  return { positions, uvs, rands }
}

function slerpOnSphere(a, b, t, radius) {
  const na = a.clone().normalize()
  const nb = b.clone().normalize()
  const dot = THREE.MathUtils.clamp(na.dot(nb), -1, 1)
  const omega = Math.acos(dot)
  if (omega < 1e-4) return na.clone().multiplyScalar(radius)
  const so = Math.sin(omega)
  return na.clone().multiplyScalar(Math.sin((1 - t) * omega) / so)
    .add(nb.clone().multiplyScalar(Math.sin(t * omega) / so))
    .multiplyScalar(radius)
}

const MAJOR_CITIES = [
  [40.7, -74.0],  // NYC
  [37.8, -122.4], // SF
  [34.0, -118.2], // LA
  [41.8, -87.6],  // Chicago
  [19.4, -99.1],  // CDMX
  [-23.5, -46.6], // SP
  [-34.6, -58.4], // BA
  [51.5, -0.1],   // London
  [48.9, 2.3],    // Paris
  [52.5, 13.4],   // Berlin
  [40.4, -3.7],   // Madrid
  [25.2, 55.3],   // Dubai
  [1.3, 103.8],   // Singapur
  [35.7, 139.7],  // Tokyo
  [31.2, 121.4],  // Shanghai
  [22.3, 114.2],  // HK
  [-33.9, 151.2], // Sydney
  [28.6, 77.2],   // Delhi
]

const COLORS = [
  '#0a192f', // Azul Navy
  '#60a5fa', // Azul Claro
  '#34d399', // Verde Claro
  '#94a3b8', // Gris
]

// Generamos 40 rutas aleatorias pero semi-estables
const ROUTES = Array.from({ length: 40 }).map((_, i) => {
  // Pseudo-random usando el índice
  const startIdx = (i * 7) % MAJOR_CITIES.length
  const endIdx = (i * 13 + 5) % MAJOR_CITIES.length
  // (i * 7) con length 4 distribuye de manera pareja
  const colorIdx = (i * 7) % COLORS.length 
  return {
    from: MAJOR_CITIES[startIdx],
    to: MAJOR_CITIES[endIdx !== startIdx ? endIdx : (endIdx + 1) % MAJOR_CITIES.length],
    color: COLORS[colorIdx]
  }
})

const dotVert = /* glsl */`
  uniform float u_time;
  uniform float u_size;
  uniform float u_pixelRatio;
  uniform sampler2D u_map;
  
  attribute float a_rand;
  attribute vec2 a_uv;
  
  varying float v_fres;
  varying float v_land;
  varying float v_rand;

  void main() {
    v_rand = a_rand;
    float waterMask = texture2D(u_map, a_uv).r;
    v_land = 1.0 - smoothstep(0.1, 0.5, waterMask);

    if (v_land < 0.1) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); 
        return;
    }

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
    v_fres = clamp(nrm.z, 0.0, 1.0);

    float tw = 0.95 + 0.05 * sin(u_time * 0.8 + a_rand * 50.0);
    float sz = u_size * (0.65 + a_rand * 0.35) * tw;
    
    gl_PointSize = sz * u_pixelRatio * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const dotFrag = /* glsl */`
  precision highp float;
  uniform vec3 u_land_color;
  varying float v_fres;
  varying float v_land;

  void main() {
    if (v_land < 0.1) discard;

    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float circle = smoothstep(0.48, 0.06, d);
    if (circle < 0.01) discard;

    float fresnelAlpha = 0.45 + 0.55 * pow(v_fres, 0.5);
    float alpha = circle * fresnelAlpha;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(u_land_color, alpha);
  }
`

const arcVert = /* glsl */`
  attribute float a_t;
  attribute float a_arc;
  attribute vec3 a_color;
  varying float v_t;
  varying float v_arc;
  varying float v_fres;
  varying vec3 v_color;

  void main() {
    v_t = a_t;
    v_arc = a_arc;
    v_color = a_color;
    vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
    v_fres = clamp(nrm.z, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const arcFrag = /* glsl */`
  precision highp float;
  uniform float u_time;
  varying float v_t;
  varying float v_arc;
  varying float v_fres;
  varying vec3 v_color;

  void main() {
    // Velocidad de la animación (cada ciclo dura unos 4.5 segundos)
    float speed = 0.22;
    // phase va de 0.0 a 1.0
    float phase = fract(u_time * speed + v_arc * 0.81); 

    // Fase 1: Dibujado de la conexión (0.0 -> 0.35)
    // El haz crece desde el punto A hasta el punto B
    float drawProgress = smoothstep(0.0, 0.35, phase);
    
    // Si este pixel está por delante del progreso de dibujo, no se ve todavía
    if (v_t > drawProgress) discard;

    // Fase 2: Desvanecimiento (0.6 -> 1.0)
    // La línea entera se apaga suavemente para dar paso a otras
    float fade = 1.0 - smoothstep(0.6, 1.0, phase);

    // Brillo intenso en la "punta" de la conexión sólo mientras se está dibujando
    float isDrawing = step(phase, 0.35); // 1.0 si phase < 0.35, 0.0 si no
    float tipGlow = exp(-abs(v_t - drawProgress) * 20.0) * isDrawing;

    // La base de la línea se hace sutilmente más opaca hacia el destino
    float baseAlpha = 0.25 + 0.5 * v_t; 
    
    // Alpha combinado (línea base + punta brillante) afectado por el fade general
    float lineAlpha = (baseAlpha + tipGlow * 2.0) * fade;

    // Ocultar suavemente las partes en la cara posterior del globo
    float depthMask = 0.15 + 0.85 * v_fres;
    float alpha = lineAlpha * depthMask;
    
    if (alpha < 0.015) discard;

    // Aumentamos el brillo del color en la punta
    vec3 col = v_color * (0.7 + tipGlow * 1.5);
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Aurora Base ────────────────────────────────────────────────────────────
// "Cord Aesthetic": Minimalista, Apple-like, gris/plata sutil, no neón.
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
  varying vec3 v_nrm;
  varying vec3 v_view;
  void main() {
    float fres = pow(1.0 - abs(dot(v_nrm, v_view)), 1.5);
    float alpha = fres * 0.18;
    float core = (1.0 - fres) * 0.02; 
    // Aurora gris-plata con un ligerísimo tono azul frío (Cord minimal)
    gl_FragColor = vec4(vec3(0.92, 0.94, 0.96), alpha + core);
  }
`

function GlobeAtmosphere() {
  return (
    <>
      {/* Halo exterior suave y elegante */}
      <mesh scale={1.04}>
        <sphereGeometry args={[R, 48, 48]} />
        <shaderMaterial
          vertexShader={atmoVert}
          fragmentShader={atmoFrag}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      {/* Base sólida gris Apple (f5f5f7) súper sutil */}
      <mesh scale={0.99}>
        <sphereGeometry args={[R, 48, 48]} />
        <meshBasicMaterial color="#f5f5f7" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  )
}

function GlobeDots({ count = 18000 }) {
  const matRef = useRef()
  const earthTexture = useLoader(THREE.TextureLoader, EARTH_MASK_URL)
  
  earthTexture.minFilter = THREE.LinearFilter
  earthTexture.magFilter = THREE.LinearFilter

  const geometry = useMemo(() => {
    const { positions, uvs, rands } = fibonacciSphere(count, R)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('a_uv', new THREE.BufferAttribute(uvs, 2))
    g.setAttribute('a_rand', new THREE.BufferAttribute(rands, 1))
    return g
  }, [count])

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_size:       { value: 12.0 },
    u_pixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    u_map:        { value: earthTexture },
    // Cord signature Navy: #0a192f (hace muchísimo contraste en modo claro)
    u_land_color: { value: new THREE.Color('#0a192f') },
  }), [earthTexture])

  useFrame(({ clock }) => {
    if (matRef.current) uniforms.u_time.value = clock.getElapsedTime()
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={dotVert}
        fragmentShader={dotFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  )
}

function GlobeArcs({ segments = 128 }) {
  const matRef = useRef()

  const geometry = useMemo(() => {
    const positions = []
    const aT = []
    const aArc = []
    const aColor = []
    const indices = []
    let vOffset = 0

    ROUTES.forEach((route, p) => {
      const a = latLonToVec3(route.from[0], route.from[1], R)
      const b = latLonToVec3(route.to[0], route.to[1], R)
      const col = new THREE.Color(route.color)

      for (let s = 0; s <= segments; s++) {
        const t = s / segments
        const pos = slerpOnSphere(a, b, t, R)
        const bulge = Math.sin(t * Math.PI) * 0.16 
        pos.setLength(R + bulge)
        positions.push(pos.x, pos.y, pos.z)
        aT.push(t)
        aArc.push(p)
        aColor.push(col.r, col.g, col.b)
        if (s < segments) indices.push(vOffset + s, vOffset + s + 1)
      }
      vOffset += segments + 1
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('a_t', new THREE.Float32BufferAttribute(aT, 1))
    g.setAttribute('a_arc', new THREE.Float32BufferAttribute(aArc, 1))
    g.setAttribute('a_color', new THREE.Float32BufferAttribute(aColor, 3))
    g.setIndex(indices)
    return g
  }, [segments])

  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
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
      />
    </lineSegments>
  )
}

function GlobeScene({ reduced }) {
  const groupRef = useRef()
  // Ya no rotamos manualmente aquí, OrbitControls se encarga de la auto-rotación.
  return (
    <group ref={groupRef} rotation={[0, reduced ? -0.8 : -0.8, 0]}>
      <GlobeAtmosphere />
      <GlobeDots count={18000} />
      <GlobeArcs />
    </group>
  )
}

export default function TrustGlobe() {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [frameloop, setFrameloop] = useState('always')

  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

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
        width: '100%',
        height: '100%',
        pointerEvents: 'auto',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.9s ease',
        cursor: 'grab',
      }}
      onMouseDown={(e) => (e.currentTarget.style.cursor = 'grabbing')}
      onMouseUp={(e) => (e.currentTarget.style.cursor = 'grab')}
      onMouseLeave={(e) => (e.currentTarget.style.cursor = 'grab')}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 3.2], fov: 45, near: 0.1, far: 100 }}
        frameloop={reduced ? 'demand' : frameloop}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
          preserveDrawingBuffer: false,
        }}
        style={{ pointerEvents: 'auto', background: 'transparent' }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
      >
        <Suspense fallback={null}>
          <GlobeScene reduced={reduced} />
          <OrbitControls 
            enablePan={false} 
            enableZoom={false} 
            autoRotate={!reduced}
            autoRotateSpeed={0.8}
            enableDamping={true}
            dampingFactor={0.05}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
