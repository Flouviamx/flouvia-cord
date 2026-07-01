import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Vertex Shader ────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// ─── Fragment Shader ──────────────────────────────────────────────────────────
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  uniform vec3  u_colorBase;
  uniform vec3  u_colorPrimary;
  uniform vec3  u_colorAccent;
  uniform vec3  u_colorGreen;
  uniform float u_greenStr;
  uniform vec3  u_colorBlue;
  uniform float u_blueStr;
  uniform float u_light;
  varying vec2  vUv;

  // ── Simplex Noise 3D (Stefan Gustavson, dominio público) ──────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
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
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
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
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // ── FBM 4 octavas ─────────────────────────────────────────────────────────
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p  = p * 2.1 + vec3(5.2, 1.3, 8.7);
      a *= 0.5;
    }
    return v;
  }

  // ── Film Grain ────────────────────────────────────────────────────────────
  float grain(vec2 uv, float t) {
    vec2 j = uv + fract(t * 0.0019);
    return fract(sin(dot(j, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (vUv - 0.5) * aspect;

    // ── Paleta (vía uniforms — dark por defecto, claro si light=true) ─────
    vec3 colorBase   = u_colorBase;
    vec3 colorTeal   = u_colorPrimary;
    vec3 colorIndigo = u_colorAccent;

    float t = u_time * 0.62;

    // ── Mouse: empuja las auroras (coords centradas, con aspecto) ─────────
    vec2 mouse = (u_mouse - 0.5) * aspect;
    // distancia de cada pixel al cursor → las auroras se "abomban" hacia él
    vec2  toMouse = uv - mouse;
    float mDist   = length(toMouse);
    float mPull   = exp(-mDist * 1.6);           // 1 cerca del cursor, cae con la distancia
    vec2  mPush   = toMouse * mPull * 0.45;       // desplazamiento del campo hacia/desde el cursor

    // ── Deriva direccional: las auroras VIAJAN por la pantalla ────────────
    // (esto es lo que hace que el movimiento sea evidente, no solo el warp)
    vec2 drift1 = vec2(t * 0.16, t * 0.07)  + mPush;        // teal sigue al cursor
    vec2 drift2 = vec2(-t * 0.11, t * 0.05) - mPush * 0.7;  // índigo reacciona al revés

    // ── Domain warp doble (forma orgánica que se enrolla) ─────────────────
    vec3 q = vec3(uv * 0.88 + drift1, t);
    float warpX = fbm(q + vec3(0.0, 0.0, t * 0.55));
    float warpY = fbm(q + vec3(5.2, 1.3, t * 0.55));
    vec2  w0 = vec2(warpX, warpY);

    vec3 q2 = vec3(uv + drift1 + w0 * 0.55, t * 0.9);
    float warpX2 = fbm(q2 + vec3(1.7, 9.2, 0.0));
    float warpY2 = fbm(q2 + vec3(8.3, 2.8, 1.1));
    vec2  w1 = vec2(warpX2, warpY2);

    // ── Capa 1: aurora teal principal (deriva + warp) ─────────────────────
    // forma suave y spread, pero TENUE (la intensidad la baja el mix, abajo)
    float blob1 = fbm(vec3(uv + drift1 + w1 * 0.60, t * 0.9));
    blob1 = smoothstep(-0.05, 0.64, blob1);
    blob1 = pow(blob1, 1.8);

    // ── Capa 2: índigo, acento sesgado a la esquina abajo-izquierda ───────
    vec3 q4 = vec3(uv * 0.58 + drift2 - w0 * 0.32, t * 0.62 + 7.5);
    float blob3 = fbm(q4 + vec3(3.1, 7.4, 0.0));
    blob3 = smoothstep(-0.05, 0.66, blob3);
    blob3 = pow(blob3, 2.0);
    // refuerzo en la esquina inferior-izquierda (donde uv.x→izq, uv.y→abajo)
    float corner = smoothstep(0.55, -0.35, uv.x) * smoothstep(0.45, -0.35, uv.y);
    blob3 = max(blob3, blob3 * 0.6 + corner * 0.55);

    // ── Breathing: cada aurora respira a su propio ritmo ──────────────────
    float breath1 = 0.74 + 0.26 * sin(u_time * 0.50);
    float breath3 = 0.62 + 0.38 * sin(u_time * 0.42 + 4.19);

    // ── Capa 3: aurora verde (solo modo claro, esquina derecha-abajo) ─────
    vec2 driftG = vec2(t * 0.09, -t * 0.13) + mPush * 0.5;
    vec3 qG = vec3(uv * 0.72 + driftG + w1 * 0.45, t * 0.78 + 3.3);
    float blobG = fbm(qG + vec3(6.2, 0.8, 2.4));
    blobG = smoothstep(-0.05, 0.62, blobG);
    blobG = pow(blobG, 2.1);
    float cornerG = smoothstep(-0.55, 0.45, uv.x) * smoothstep(-0.40, 0.35, uv.y);
    blobG = max(blobG, blobG * 0.5 + cornerG * 0.50);
    float breathG = 0.68 + 0.32 * sin(u_time * 0.37 + 2.1);

    // ── Capa 4: aurora azul eléctrico (solo modo oscuro, arriba-derecha) ──
    vec2 driftB = vec2(t * 0.13, -t * 0.08) - mPush * 0.6;
    vec3 qB = vec3(uv * 0.65 + driftB - w0 * 0.40, t * 0.85 + 9.1);
    float blobB = fbm(qB + vec3(2.9, 4.7, 1.5));
    blobB = smoothstep(-0.08, 0.60, blobB);
    blobB = pow(blobB, 1.9);
    // ancla arriba-derecha, lejos del teal (centro-izquierda)
    float cornerB = smoothstep(-0.40, 0.55, uv.x) * smoothstep(-0.30, 0.50, -uv.y);
    blobB = max(blobB, blobB * 0.55 + cornerB * 0.48);
    float breathB = 0.70 + 0.30 * sin(u_time * 0.44 + 1.3);

    // ── Compositing (teal principal + acento índigo) ──────────────────────
    // modo oscuro: mix 0.55 (tenue); modo claro: 0.82 (más visible sobre blanco)
    float mixStr = mix(0.55, 0.82, u_light);
    float glow = mPull * mix(0.22, 0.35, u_light);
    vec3 color = colorBase;
    color = mix(color, colorTeal,   clamp(blob1 * mixStr * breath1 + glow * blob1, 0.0, 1.0));
    color = mix(color, colorIndigo, blob3 * mixStr * breath3);
    // aurora verde: solo cuando u_greenStr > 0 (modo claro)
    color = mix(color, u_colorGreen, clamp(blobG * u_greenStr * breathG, 0.0, 1.0));
    // aurora azul eléctrico: solo cuando u_blueStr > 0 (modo oscuro)
    color = mix(color, u_colorBlue,  clamp(blobB * u_blueStr  * breathB, 0.0, 1.0));

    // ── Viñeta (casi nula en modo claro) ──────────────────────────────────
    float vig = 1.0 - dot(uv * 0.88, uv * 0.88);
    color *= clamp(pow(vig, mix(0.50, 0.15, u_light)), mix(0.0, 0.94, u_light), 1.0);

    // ── Film Grain (reducido en modo claro) ───────────────────────────────
    color += (grain(vUv, u_time) - 0.5) * mix(0.030, 0.006, u_light);

    // ── Tonemap: Reinhard en oscuro, bypass en claro ───────────────────────
    vec3 tonemapped = color / (color + vec3(0.17));
    color = mix(tonemapped, color, u_light);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Paletas ─────────────────────────────────────────────────────────────────
const PALETTE_DARK = {
  base:     new THREE.Color(0.043, 0.059, 0.098), // #0B0F19 navy
  primary:  new THREE.Color(0.000, 0.290, 0.205), // teal esmeralda
  accent:   new THREE.Color(0.105, 0.040, 0.250), // índigo
  green:    new THREE.Color(0.200, 0.700, 0.400), // inerte en dark
  greenStr: 0.0,
  blue:     new THREE.Color(0.180, 0.510, 0.980), // azul eléctrico #2e82fa
  blueStr:  0.62,
}
const PALETTE_LIGHT = {
  base:     new THREE.Color(0.965, 0.976, 0.988), // #f6f9fc blanco suave
  primary:  new THREE.Color(0.490, 0.780, 0.960), // azul cielo #7dc7f5
  accent:   new THREE.Color(0.580, 0.820, 0.940), // azul más suave (complementa)
  green:    new THREE.Color(0.380, 0.840, 0.580), // verde esmeralda #61d694
  greenStr: 0.78,
  blue:     new THREE.Color(0.180, 0.510, 0.980), // inerte en light
  blueStr:  0.0,
}

// ─── Mesh fullscreen ─────────────────────────────────────────────────────────
function AuroraPlane({ light = false }) {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))
  const isHovering = useRef(false)
  const hoverTimeout = useRef(null)

  const pal = light ? PALETTE_LIGHT : PALETTE_DARK

  const uniforms = useMemo(() => ({
    u_time:         { value: 0 },
    u_resolution:   { value: new THREE.Vector2(800, 600) },
    u_mouse:        { value: new THREE.Vector2(0.5, 0.5) },
    u_colorBase:    { value: pal.base.clone() },
    u_colorPrimary: { value: pal.primary.clone() },
    u_colorAccent:  { value: pal.accent.clone() },
    u_colorGreen:   { value: pal.green.clone() },
    u_greenStr:     { value: pal.greenStr },
    u_colorBlue:    { value: pal.blue.clone() },
    u_blueStr:      { value: pal.blueStr },
    u_light:        { value: light ? 1.0 : 0.0 },
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
    <mesh ref={meshRef}>
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

// ─── Componente exportable ────────────────────────────────────────────────────
// position: absolute → vive dentro del hero, no cubre toda la página
// prop `light` → paleta clara (fondo blanco, aurora azul cielo + verde menta)
export default function DarkAuroraBg({ light = false }) {
  const [visible, setVisible] = useState(false)

  // Fade-in suave tras montar para evitar el flash inicial
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <Canvas
      style={{
        position:      'absolute',
        inset:         0,
        zIndex:        1,
        pointerEvents: 'none',
        opacity:       visible ? 1 : 0,
        transition:    'opacity 0.8s ease',
      }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      gl={{
        antialias:            false,
        powerPreference:      'low-power',
        preserveDrawingBuffer: false,
      }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <AuroraPlane light={light} />
    </Canvas>
  )
}
