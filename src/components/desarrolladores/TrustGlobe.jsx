import { useRef, useMemo, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// TrustGlobe v3 — "Cord Premium" — Estilo GitHub/Stripe
//   Océano:       navy profundo con red hexagonal sutil (datos en movimiento).
//   Continentes:  puntos luminosos azul cielo/blanco, alto contraste vs océano.
//   Halo:         resplandor azul Cord limpio.
//   Arcos:        conexiones animadas entre ciudades, colores vibrantes.
//   SIN líneas de grilla. Interactivo (drag + auto-rotate).
// ─────────────────────────────────────────────────────────────────────────────

const R = 1.0
const EARTH_MASK_URL = 'https://unpkg.com/three-globe/example/img/earth-water.png'

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180
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
    positions[i * 3]     = x * radius
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = z * radius
    const lat = Math.asin(THREE.MathUtils.clamp(y, -1, 1))
    const lon = Math.atan2(x, z)
    uvs[i * 2]     = (lon + Math.PI) / (2 * Math.PI)
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

/* ── Routes ───────────────────────────────────────────────────────────────── */

const CITIES = [
  [40.7,-74],[37.8,-122.4],[34,-118.2],[41.8,-87.6],[19.4,-99.1],
  [-23.5,-46.6],[-34.6,-58.4],[51.5,-0.1],[48.9,2.3],[52.5,13.4],
  [40.4,-3.7],[25.2,55.3],[1.3,103.8],[35.7,139.7],[31.2,121.4],
  [22.3,114.2],[-33.9,151.2],[28.6,77.2],
]
const ARC_COLORS = ['#60a5fa','#93c5fd','#38bdf8','#a5b4fc']
const ROUTES = Array.from({length:40}).map((_,i) => {
  const si = (i*7)%CITIES.length
  let ei = (i*13+5)%CITIES.length
  if(ei===si) ei = (ei+1)%CITIES.length
  return { from:CITIES[si], to:CITIES[ei], color:ARC_COLORS[(i*7)%ARC_COLORS.length] }
})

/* ═══════════════════════════════════════════════════════════════════════════ *
 *  SHADERS
 * ═══════════════════════════════════════════════════════════════════════════ */

// ─── Ocean: Navy sphere + animated hex data-grid ─────────────────────────
const oceanVert = /* glsl */`
  varying vec3 v_pos;
  varying vec3 v_nrm;
  varying vec3 v_view;
  void main(){
    v_pos = position;
    v_nrm = normalize(mat3(modelViewMatrix)*normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    v_view = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const oceanFrag = /* glsl */`
  precision highp float;
  uniform float u_time;
  varying vec3 v_pos;
  varying vec3 v_nrm;
  varying vec3 v_view;

  /* ── Hexagonal grid (Shadertoy classic) ── */
  // Returns hex center and distance to border
  vec4 hexGrid(vec2 p){
    vec2 q = vec2(p.x*1.1547, p.y + p.x*0.5774);
    vec2 pi = floor(q);
    vec2 pf = fract(q);
    float v = mod(pi.x+pi.y, 3.0);
    float ca = step(1.0,v);
    float cb = step(2.0,v);
    vec2 ma = step(pf.xy, pf.yx);
    float e = dot(ma, 1.0-pf.yx + ca*(pf.x+pf.y-1.0) + cb*(pf.yx-2.0*pf.xy));
    p = vec2(q.x + floor(0.5+p.y/1.7321), p.y/1.7321)
      + vec2(ca, cb) - vec2(ma);
    return vec4(p, e, 0.0);
  }

  void main(){
    float fres = pow(1.0 - abs(dot(v_nrm, v_view)), 2.0);
    // Sphere UV from 3D position
    vec3 n = normalize(v_pos);
    float lon = atan(n.x, n.z);
    float lat = asin(clamp(n.y,-1.0,1.0));
    vec2 uv = vec2((lon+3.14159)/6.28318, (lat+1.5708)/3.14159);

    // Hex grid — two layers at different scales
    vec2 h1uv = uv * vec2(32.0,20.0) + vec2(u_time*0.008, u_time*0.005);
    vec4 h1 = hexGrid(h1uv);
    float edge1 = smoothstep(0.03, 0.06, h1.z);
    // Pulsing cells
    float pulse1 = sin(h1.x*3.7 + h1.y*5.3 + u_time*0.4)*0.5+0.5;
    float cellGlow1 = (1.0-edge1) * pulse1 * 0.12;

    vec2 h2uv = uv * vec2(56.0,36.0) + vec2(-u_time*0.012, u_time*0.007);
    vec4 h2 = hexGrid(h2uv);
    float edge2 = smoothstep(0.02, 0.05, h2.z);
    float pulse2 = sin(h2.x*2.1 + h2.y*4.7 + u_time*0.6)*0.5+0.5;
    float cellGlow2 = (1.0-edge2) * pulse2 * 0.06;

    // Base navy
    vec3 base = vec3(0.035, 0.075, 0.14); // #09132A ≈ deep navy
    // Hex edge lines — very subtle steel blue
    vec3 lineCol = vec3(0.12, 0.20, 0.36);
    // Glowing cells — slightly brighter
    vec3 glowCol = vec3(0.16, 0.30, 0.55);

    vec3 col = base;
    col = mix(col, lineCol, (1.0-edge1)*0.25 + (1.0-edge2)*0.12);
    col += glowCol * (cellGlow1 + cellGlow2);

    // Fresnel rim — Cord blue
    vec3 rimCol = vec3(0.24, 0.47, 0.92);
    col = mix(col, rimCol, fres*0.30);

    float alpha = 0.96;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Continent dots ──────────────────────────────────────────────────────
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
  void main(){
    v_rand = a_rand;
    float waterMask = texture2D(u_map, a_uv).r;
    v_land = 1.0 - smoothstep(0.1,0.5,waterMask);
    if(v_land<0.1){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vec3 nrm = normalize(mat3(modelViewMatrix) * normalize(position));
    v_fres = clamp(nrm.z,0.0,1.0);
    float tw = 0.96 + 0.04*sin(u_time*0.7 + a_rand*40.0);
    float sz = u_size * (0.6 + a_rand*0.4) * tw;
    gl_PointSize = sz * u_pixelRatio * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const dotFrag = /* glsl */`
  precision highp float;
  uniform vec3 u_land_hi;
  uniform vec3 u_land_lo;
  uniform float u_time;
  varying float v_fres;
  varying float v_land;
  varying float v_rand;
  void main(){
    if(v_land<0.1) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float circle = smoothstep(0.48,0.02,d);
    if(circle<0.01) discard;
    float fresnelAlpha = 0.55 + 0.45*pow(v_fres,0.35);
    float shimmer = 0.94 + 0.06*sin(u_time*1.0 + v_rand*25.0);
    float alpha = circle * fresnelAlpha * shimmer;
    if(alpha<0.01) discard;
    // Mix between bright sky blue and white for premium luminous look
    vec3 col = mix(u_land_lo, u_land_hi, v_rand*0.6 + 0.2);
    // Tiny glow boost for the brightest dots
    col += vec3(0.08,0.12,0.2) * (1.0-v_rand) * shimmer;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Atmosphere halo ─────────────────────────────────────────────────────
const atmoVert = /* glsl */`
  varying vec3 v_nrm; varying vec3 v_view;
  void main(){
    v_nrm = normalize(mat3(modelViewMatrix)*normal);
    vec4 mv = modelViewMatrix*vec4(position,1.0);
    v_view = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }
`
const atmoFrag = /* glsl */`
  precision highp float;
  varying vec3 v_nrm; varying vec3 v_view;
  void main(){
    float fres = pow(1.0-abs(dot(v_nrm,v_view)),2.5);
    vec3 col = vec3(0.25,0.50,0.95); // Cord blue glow
    gl_FragColor = vec4(col, fres*0.18);
  }
`

// ─── Arcs ────────────────────────────────────────────────────────────────
const arcVert = /* glsl */`
  attribute float a_t; attribute float a_arc; attribute vec3 a_color;
  varying float v_t; varying float v_arc; varying float v_fres; varying vec3 v_color;
  void main(){
    v_t=a_t; v_arc=a_arc; v_color=a_color;
    vec3 nrm=normalize(mat3(modelViewMatrix)*normalize(position));
    v_fres=clamp(nrm.z,0.0,1.0);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`
const arcFrag = /* glsl */`
  precision highp float;
  uniform float u_time;
  varying float v_t,v_arc,v_fres; varying vec3 v_color;
  void main(){
    float phase=fract(u_time*0.22+v_arc*0.81);
    float draw=smoothstep(0.0,0.35,phase);
    if(v_t>draw) discard;
    float fade=1.0-smoothstep(0.6,1.0,phase);
    float isD=step(phase,0.35);
    float tip=exp(-abs(v_t-draw)*22.0)*isD;
    float base=0.25+0.55*v_t;
    float a=(base+tip*2.5)*fade*(0.15+0.85*v_fres);
    if(a<0.015) discard;
    gl_FragColor=vec4(v_color*(0.75+tip*2.0), a);
  }
`

/* ═══════════════════════════════════════════════════════════════════════════ *
 *  COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════ */

function GlobeOcean() {
  const ref = useRef()
  const u = useMemo(() => ({ u_time: { value: 0 } }), [])
  useFrame(({ clock }) => { if(ref.current) u.u_time.value = clock.getElapsedTime() })
  return (
    <mesh scale={0.997}>
      <sphereGeometry args={[R,64,64]} />
      <shaderMaterial ref={ref}
        vertexShader={oceanVert} fragmentShader={oceanFrag}
        uniforms={u} transparent depthWrite />
    </mesh>
  )
}

function GlobeAtmosphere() {
  return (
    <mesh scale={1.05}>
      <sphereGeometry args={[R,48,48]} />
      <shaderMaterial
        vertexShader={atmoVert} fragmentShader={atmoFrag}
        transparent side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

function GlobeDots({ count = 22000 }) {
  const ref = useRef()
  const tex = useLoader(THREE.TextureLoader, EARTH_MASK_URL)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter

  const geo = useMemo(() => {
    const { positions, uvs, rands } = fibonacciSphere(count, R)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('a_uv', new THREE.BufferAttribute(uvs, 2))
    g.setAttribute('a_rand', new THREE.BufferAttribute(rands, 1))
    return g
  }, [count])

  const u = useMemo(() => ({
    u_time:       { value: 0 },
    u_size:       { value: 13.0 },
    u_pixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    u_map:        { value: tex },
    // Two-tone luminous land
    u_land_hi:    { value: new THREE.Color('#e0edff') }, // near-white blue
    u_land_lo:    { value: new THREE.Color('#60a5fa') }, // sky blue
  }), [tex])

  useFrame(({ clock }) => { if(ref.current) u.u_time.value = clock.getElapsedTime() })

  return (
    <points geometry={geo}>
      <shaderMaterial ref={ref}
        vertexShader={dotVert} fragmentShader={dotFrag}
        uniforms={u} transparent depthWrite={false} />
    </points>
  )
}

function GlobeArcs({ segments = 128 }) {
  const ref = useRef()
  const geo = useMemo(() => {
    const pos=[],aT=[],aA=[],aC=[],idx=[]
    let off=0
    ROUTES.forEach((r,p)=>{
      const a=latLonToVec3(r.from[0],r.from[1],R)
      const b=latLonToVec3(r.to[0],r.to[1],R)
      const c=new THREE.Color(r.color)
      for(let s=0;s<=segments;s++){
        const t=s/segments
        const v=slerpOnSphere(a,b,t,R)
        v.setLength(R+Math.sin(t*Math.PI)*0.17)
        pos.push(v.x,v.y,v.z); aT.push(t); aA.push(p); aC.push(c.r,c.g,c.b)
        if(s<segments) idx.push(off+s,off+s+1)
      }
      off+=segments+1
    })
    const g=new THREE.BufferGeometry()
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3))
    g.setAttribute('a_t',new THREE.Float32BufferAttribute(aT,1))
    g.setAttribute('a_arc',new THREE.Float32BufferAttribute(aA,1))
    g.setAttribute('a_color',new THREE.Float32BufferAttribute(aC,3))
    g.setIndex(idx)
    return g
  }, [segments])

  const u = useMemo(() => ({ u_time: { value: 0 } }), [])
  useFrame(({ clock }) => { if(ref.current) u.u_time.value = clock.getElapsedTime() })

  return (
    <lineSegments geometry={geo}>
      <shaderMaterial ref={ref}
        vertexShader={arcVert} fragmentShader={arcFrag}
        uniforms={u} transparent depthWrite={false} />
    </lineSegments>
  )
}

function GlobeScene({ reduced }) {
  return (
    <group rotation={[0.18, reduced ? -0.8 : -0.8, 0]}>
      <GlobeAtmosphere />
      <GlobeOcean />
      <GlobeDots count={22000} />
      <GlobeArcs />
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ *
 *  EXPORT
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function TrustGlobe() {
  const wrap = useRef(null)
  const [vis, setVis] = useState(false)
  const [fl, setFl] = useState('always')
  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => { const id = requestAnimationFrame(() => setVis(true)); return () => cancelAnimationFrame(id) }, [])
  useEffect(() => {
    const el = wrap.current; if(!el) return
    if(reduced){ setFl('demand'); return }
    const io = new IntersectionObserver(([e])=>setFl(e.isIntersecting?'always':'never'),{threshold:0.05})
    io.observe(el); return ()=>io.disconnect()
  }, [reduced])

  return (
    <div ref={wrap} style={{
      width:'100%', height:'100%', pointerEvents:'auto',
      opacity:vis?1:0, transition:'opacity 0.9s ease', cursor:'grab',
    }}
      onMouseDown={e=>(e.currentTarget.style.cursor='grabbing')}
      onMouseUp={e=>(e.currentTarget.style.cursor='grab')}
      onMouseLeave={e=>(e.currentTarget.style.cursor='grab')}
    >
      <Canvas
        dpr={[1,2]}
        camera={{ position:[0,0,2.85], fov:45, near:0.1, far:100 }}
        frameloop={reduced?'demand':fl}
        gl={{ antialias:true, alpha:true, powerPreference:'low-power', preserveDrawingBuffer:false }}
        style={{ pointerEvents:'auto', background:'transparent' }}
        resize={{ scroll:false, debounce:{ scroll:50, resize:0 } }}
      >
        <Suspense fallback={null}>
          <GlobeScene reduced={reduced} />
          <OrbitControls enablePan={false} enableZoom={false}
            autoRotate={!reduced} autoRotateSpeed={0.6}
            enableDamping dampingFactor={0.05} />
        </Suspense>
      </Canvas>
    </div>
  )
}
