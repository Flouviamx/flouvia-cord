import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Fondo de los heroes de /soluciones y /casos-de-uso: una "ola de seda"
// diagonal que entra por abajo a la izquierda y barre hacia arriba a la
// derecha. A la izquierda del borde queda el fondo liso (ahí vive el texto); a
// la derecha, el cuerpo de la tela en cinco tonos, con pliegues que brillan.
// `light` adapta el tratamiento a fondos claros: sin viñeta, halo mezclado en
// vez de sumado y sombreado más plano.
//
// Calidad:
// - Los colores llegan en espacio LINEAL (three con ColorManagement convierte
//   el hex al asignarlo), así que la mezcla se hace en lineal y la salida se
//   convierte a sRGB al final. Sin esa conversión la tela salía oscura y turbia.
// - Resolución nativa (hasta 2x); si el cuadro se alarga, baja sola.
// - Normales por derivadas de pantalla (dFdx/dFdy): un solo cálculo del campo
//   por píxel en lugar de tres.
//
// Reacción: el stack de tarjetas del hero emite `cord:hero-shift` al rotar; la
// tela recibe un empujón amortiguado que viaja a lo largo del pliegue.

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  uniform float u_compact;
  uniform float u_light;
  uniform float u_kickAge;
  uniform float u_kickDir;

  uniform vec3 u_base;
  uniform vec3 u_c1;   // cresta
  uniform vec3 u_c2;
  uniform vec3 u_c3;
  uniform vec3 u_c4;
  uniform vec3 u_c5;   // fondo de la tela

  varying vec2 vUv;

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

  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * snoise(p);
      p = p * 2.03 + vec3(3.1, 1.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  // Empujón de las tarjetas: sube rápido y se apaga con un rebote suave.
  float kickEnv() {
    return u_kickDir == 0.0 ? 0.0 : exp(-u_kickAge * 2.1) * smoothstep(0.0, 0.12, u_kickAge);
  }

  // Campo con signo respecto al borde de la tela: < 0 es el lado liso.
  float field(vec2 p, float t, vec2 m, float A, float env) {
    float gWide = p.x - (0.30 * A + 0.34 * A * p.y);
    gWide -= 0.10 * A * sin(p.y * 2.2 + 0.6);
    float gTall = (0.36 - p.y) + 0.9 * (p.x - 0.5 * A) + 0.04 * sin(p.x * 9.0 + 0.8);
    float g = mix(gWide, gTall, u_compact);
    g += 0.055 * sin(p.y * 3.4 - t * 1.6) + 0.035 * sin(p.y * 7.1 + t * 1.1);
    g += 0.07 * fbm(vec3(p * 1.1, t * 0.6));
    vec2 d = p - m;
    g += 0.06 * exp(-dot(d, d) * 5.0);
    // La onda del empujón recorre el filo de abajo hacia arriba.
    g += u_kickDir * env * (0.03 + 0.055 * sin(p.y * 4.2 - u_kickAge * 6.5));
    return g;
  }

  vec3 toSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  // Hombro suave para los brillos de la tela (el fondo no pasa por aquí, así
  // que el tono base queda exacto y no hay costura con la página).
  vec3 shoulder(vec3 c) {
    vec3 k = max(c - 0.75, 0.0);
    return c - k + k / (1.0 + k * 2.2);
  }

  void main() {
    float A = u_resolution.x / u_resolution.y;
    vec2 p = vec2(vUv.x * A, vUv.y);
    vec2 m = vec2(u_mouse.x * A, u_mouse.y);
    float t = u_time * 0.35;
    float env = kickEnv();

    float g = field(p, t, m, A, env);

    // Pliegues: crestas paralelas al filo. El empujón adelanta su fase.
    float warp = fbm(vec3(p * 0.9, t * 0.4));
    float phase = g * 15.0 - t * 2.2 + warp * 2.4 + u_kickDir * env * 2.6;
    float folds = sin(phase);
    // Arrugas finas (alta frecuencia, amplitud baja) para el detalle de cerca.
    float micro = snoise(vec3(p * 9.0, t * 0.8)) * 0.18;
    float H = 0.5 + 0.5 * folds + micro * 0.25;

    // Normal de la superficie desde derivadas de pantalla.
    float s = u_resolution.y * 0.045;
    vec3 N = normalize(vec3(-dFdx(H) * s, -dFdy(H) * s, 1.0));
    vec3 L = normalize(vec3(-0.55, 0.75, 0.62));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 Hh = normalize(L + V);
    float diff = dot(N, L) * 0.5 + 0.5;
    float spec = pow(max(dot(N, Hh), 0.0), 64.0);
    float sheen = pow(max(dot(N, Hh), 0.0), 8.0);

    // ── Cuerpo de la tela (lineal) ──
    float body = smoothstep(0.0, 0.012, g);
    float depth = clamp(g / (0.95 * A), 0.0, 1.0);
    vec3 cloth = mix(u_c1, u_c2, smoothstep(0.00, 0.10, g));
    cloth = mix(cloth, u_c3, smoothstep(0.06, 0.28, g));
    cloth = mix(cloth, u_c4, smoothstep(0.22, 0.55, g));
    cloth = mix(cloth, u_c5, smoothstep(0.45, 1.05, g + (1.0 - p.y) * 0.25));
    cloth = mix(cloth, u_c4, smoothstep(0.55, 1.0, p.y) * 0.35 * smoothstep(0.05, 0.3, g));

    // Segunda capa de tela: un filo interior que monta sobre la primera.
    float g2 = g - 0.24 - 0.05 * sin(p.y * 2.7 + t * 0.9) - 0.03 * warp;
    float layer = smoothstep(0.0, 0.01, g2);
    cloth = mix(cloth, mix(cloth, u_c5, 0.35), layer * mix(0.55, 0.3, u_light));
    float crest2 = exp(-abs(g2 - 0.006) * 70.0) * (1.0 - smoothstep(0.5, 1.0, depth));

    // Luz: difusa según la normal, brillo especular de seda y sheen amplio.
    float shade = mix(0.62 + 0.38 * diff, 0.86 + 0.14 * diff, u_light);
    cloth *= shade;
    vec3 warm = mix(u_c2, vec3(1.0, 0.86, 0.74), 0.5);
    cloth += warm * sheen * 0.10 * (1.0 - depth);
    cloth += vec3(1.0, 0.95, 0.9) * spec * mix(0.55, 0.35, u_light) * (1.0 - depth * 0.6);
    cloth += vec3(1.0, 0.9, 0.8) * crest2 * 0.18;

    // Cresta principal: filo fino y encendido más un halo suave. El empujón
    // la enciende un poco más mientras dura.
    float rim = exp(-abs(g - 0.006) * 90.0);
    float glow = exp(-abs(g - 0.01) * 22.0);
    vec3 rimCol = mix(vec3(1.0, 0.78, 0.55), vec3(1.0), u_light * 0.6);
    cloth = mix(cloth, rimCol, rim * (0.55 + env * 0.3));
    cloth += mix(u_c1, u_c2, 0.4) * glow * (0.12 + env * 0.12);

    // Grano de película sólo en la tela: textura fina, no ruido.
    float grain = fract(sin(dot(gl_FragCoord.xy + floor(u_time * 24.0) * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
    cloth *= 1.0 + (grain - 0.5) * 0.035;

    cloth = shoulder(cloth);

    // ── Lado liso ──
    vec3 base = u_base;
    float spill = exp(g * 7.5) * (1.0 - body);
    vec3 lit = base + u_c2 * spill * 0.16 + u_c3 * spill * 0.07;
    vec3 tint = mix(base, u_c2, spill * 0.28);
    base = mix(lit, tint, u_light);
    base *= mix(0.82 + 0.18 * smoothstep(0.0, 1.0, vUv.x + (1.0 - vUv.y) * 0.3), 1.0, u_light);

    vec3 col = mix(base, cloth, body);
    col = toSRGB(col);

    // Dither (interleaved gradient noise) contra bandas en los degradados.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    col += (ign - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
  }
`

function RibbonPlane({ colors, compact, animate, light, onSlow }) {
  const { gl, invalidate } = useThree()
  const mouseTarget = useRef(new THREE.Vector2(0.72, 0.4))
  const mouseSmooth = useRef(new THREE.Vector2(0.72, 0.4))
  const kick = useRef({ at: -99, dir: 0 })
  const perf = useRef({ acc: 0, n: 0 })

  const uniforms = useMemo(() => ({
    u_time:       { value: 6.0 },
    u_resolution: { value: new THREE.Vector2(1440, 900) },
    u_mouse:      { value: new THREE.Vector2(0.72, 0.4) },
    u_compact:    { value: compact ? 1 : 0 },
    u_light:      { value: light ? 1 : 0 },
    u_kickAge:    { value: 99 },
    u_kickDir:    { value: 0 },
    u_base:       { value: new THREE.Color(colors.base) },
    u_c1:         { value: new THREE.Color(colors.c1) },
    u_c2:         { value: new THREE.Color(colors.c2) },
    u_c3:         { value: new THREE.Color(colors.c3) },
    u_c4:         { value: new THREE.Color(colors.c4) },
    u_c5:         { value: new THREE.Color(colors.c5) },
  }), [colors, light])

  useEffect(() => {
    uniforms.u_compact.value = compact ? 1 : 0
    invalidate()
  }, [compact, uniforms, invalidate])

  // Empujón de las tarjetas del hero.
  useEffect(() => {
    if (!animate) return
    const onShift = (e) => {
      kick.current = { at: performance.now() / 1000, dir: e.detail?.dir === -1 ? -1 : 1 }
    }
    window.addEventListener('cord:hero-shift', onShift)
    return () => window.removeEventListener('cord:hero-shift', onShift)
  }, [animate])

  useEffect(() => {
    if (!animate) return
    const el = gl.domElement
    // El rect se cachea: leerlo en cada mousemove fuerza reflow síncrono.
    let rect = el.getBoundingClientRect()
    let dirty = false
    const markDirty = () => { dirty = true }
    const onMove = (e) => {
      if (dirty) { rect = el.getBoundingClientRect(); dirty = false }
      mouseTarget.current.set(
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height,
      )
    }
    const ro = new ResizeObserver(markDirty)
    ro.observe(el)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('scroll', markDirty, { passive: true })
    window.addEventListener('resize', markDirty, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', markDirty)
      window.removeEventListener('resize', markDirty)
      ro.disconnect()
    }
  }, [gl, animate])

  useFrame(({ clock, size, viewport }, delta) => {
    uniforms.u_resolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr)
    if (!animate) return
    uniforms.u_time.value = 6.0 + clock.getElapsedTime()
    mouseSmooth.current.lerp(mouseTarget.current, 0.04)
    uniforms.u_mouse.value.copy(mouseSmooth.current)
    uniforms.u_kickAge.value = performance.now() / 1000 - kick.current.at
    uniforms.u_kickDir.value = kick.current.dir

    // Si el cuadro promedio pasa de ~26 ms, pide bajar la resolución.
    const pf = perf.current
    pf.acc += delta; pf.n += 1
    if (pf.n >= 90) {
      if (pf.acc / pf.n > 0.026) onSlow()
      pf.acc = 0; pf.n = 0
    }
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

const DEFAULT_COLORS = {
  base: '#0B1330',
  c1: '#FFB561',
  c2: '#FF6F59',
  c3: '#E2448F',
  c4: '#8A4DF0',
  c5: '#3B2FC9',
}

export default function RibbonHeroBg({ colors = DEFAULT_COLORS, light = false }) {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [inView, setInView] = useState(true)
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches,
  )
  // Resolución nativa hasta 2x (1.5x en móvil); baja por pasos si hace falta.
  const [dpr, setDpr] = useState(() => {
    if (typeof window === 'undefined') return 1
    const cap = window.matchMedia('(max-width: 880px)').matches ? 1.5 : 2
    return Math.min(window.devicePixelRatio || 1, cap)
  })
  // Con prefers-reduced-motion la tela se pinta UNA vez (frameloop "demand"):
  // la composición se conserva, sólo se quita el movimiento.
  const [reduced] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    const mq = window.matchMedia('(max-width: 880px)')
    const onChange = (e) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => { cancelAnimationFrame(id); mq.removeEventListener('change', onChange) }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
    }, { threshold: 0.01 })
    if (wrapRef.current) observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [])

  const animate = inView && !reduced
  const onSlow = () => setDpr((d) => (d > 1 ? Math.max(1, +(d - 0.25).toFixed(2)) : d))

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        orthographic
        dpr={dpr}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          stencil: false,
          depth: false,
        }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 80 } }}
      >
        <RibbonPlane colors={colors} compact={compact} animate={animate} light={light} onSlow={onSlow} />
      </Canvas>
    </div>
  )
}
