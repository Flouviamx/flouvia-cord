import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Fondo del hero de /soluciones/empresas: una "ola de seda" diagonal que entra
// por abajo a la izquierda y barre hacia arriba a la derecha. A la izquierda
// del borde queda navy profundo (ahí vive el texto); a la derecha, el cuerpo
// de la tela en ámbar → coral → magenta → violeta, con pliegues que brillan.
//
// Es un shader propio, no una paleta de CordDynamicBg: el aurora estándar es
// isotrópico (manchas por todo el lienzo) y aquí la composición necesita un
// lado oscuro garantizado para la legibilidad del título.

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

  uniform vec3 u_base;
  uniform vec3 u_c1;   // borde encendido (ámbar)
  uniform vec3 u_c2;   // coral
  uniform vec3 u_c3;   // magenta
  uniform vec3 u_c4;   // violeta
  uniform vec3 u_c5;   // índigo profundo

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

  // Campo con signo respecto al borde de la tela: < 0 es el lado navy.
  float field(vec2 p, float t, vec2 m) {
    float A = u_resolution.x / u_resolution.y;
    // Diagonal base: en el borde inferior el filo cae ~32% del ancho, arriba ~64%.
    float gWide = p.x - (0.30 * A + 0.34 * A * p.y);
    // Curvatura: la ola se arquea, no es una recta.
    gWide -= 0.10 * A * sin(p.y * 2.2 + 0.6);
    // Pantalla vertical: la tela entra por abajo y sube en diagonal suave
    // hasta la mitad, detrás de las tarjetas y lejos del título.
    float gTall = (0.50 - p.y) + 0.9 * (p.x - 0.5 * A) + 0.04 * sin(p.x * 9.0 + 0.8);
    float g = mix(gWide, gTall, u_compact);
    // Oleaje lento a lo largo del filo.
    g += 0.055 * sin(p.y * 3.4 - t * 1.6) + 0.035 * sin(p.y * 7.1 + t * 1.1);
    g += 0.07 * fbm(vec3(p * 1.1, t * 0.6));
    // El cursor empuja la tela suavemente.
    vec2 d = p - m;
    g += 0.06 * exp(-dot(d, d) * 5.0);
    return g;
  }

  void main() {
    float A = u_resolution.x / u_resolution.y;
    vec2 p = vec2(vUv.x * A, vUv.y);
    vec2 m = vec2(u_mouse.x * A, u_mouse.y);
    float t = u_time * 0.35;

    float g = field(p, t, m);

    // Normal aproximada del "pliegue" para el brillo de la seda.
    float e = 0.004;
    float gx = field(p + vec2(e, 0.0), t, m) - g;
    float gy = field(p + vec2(0.0, e), t, m) - g;
    vec2 n = normalize(vec2(gx, gy) + 1e-5);

    // Pliegues internos: bandas paralelas al filo que se desplazan.
    float folds = sin(g * 15.0 - t * 2.2 + fbm(vec3(p * 0.9, t * 0.4)) * 2.4);
    float sheen = pow(0.5 + 0.5 * folds, 5.0);

    // ── Cuerpo de la tela ──
    float body = smoothstep(0.0, 0.018, g);
    float depth = clamp(g / (0.95 * A), 0.0, 1.0);
    vec3 cloth = mix(u_c1, u_c2, smoothstep(0.00, 0.10, g));
    cloth = mix(cloth, u_c3, smoothstep(0.06, 0.28, g));
    cloth = mix(cloth, u_c4, smoothstep(0.22, 0.55, g));
    cloth = mix(cloth, u_c5, smoothstep(0.45, 1.05, g + (1.0 - p.y) * 0.25));
    // Arriba la tela se enfría hacia violeta; abajo guarda el calor.
    cloth = mix(cloth, u_c4, smoothstep(0.55, 1.0, p.y) * 0.35 * smoothstep(0.05, 0.3, g));

    // Luz: el filo es la cresta; los pliegues suman brillo cálido.
    float light = 0.78 + 0.22 * dot(n, normalize(vec2(-0.6, 0.8)));
    cloth *= light;
    cloth += sheen * mix(u_c2, vec3(1.0, 0.86, 0.72), 0.35) * 0.22 * (1.0 - depth);

    // Cresta encendida justo en el filo.
    float crest = exp(-abs(g - 0.012) * 55.0);
    cloth = mix(cloth, vec3(1.0, 0.80, 0.58), crest * 0.55);

    // ── Lado navy ──
    vec3 col = u_base;
    // Halo de luz que la tela derrama sobre el navy.
    float spill = exp(g * 7.5) * (1.0 - body);
    col += u_c2 * spill * 0.22 + u_c3 * spill * 0.10;
    // Viñeta suave arriba a la izquierda (detrás del título).
    col *= 0.85 + 0.15 * smoothstep(0.0, 1.0, vUv.x + (1.0 - vUv.y) * 0.3);

    col = mix(col, cloth, body);

    // Grano mínimo contra el banding del degradado.
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) / 255.0 * 2.0;

    gl_FragColor = vec4(col, 1.0);
  }
`

function RibbonPlane({ colors, compact, animate }) {
  const { gl, invalidate } = useThree()
  const mouseTarget = useRef(new THREE.Vector2(0.72, 0.4))
  const mouseSmooth = useRef(new THREE.Vector2(0.72, 0.4))

  const uniforms = useMemo(() => ({
    u_time:       { value: 6.0 },
    u_resolution: { value: new THREE.Vector2(1440, 900) },
    u_mouse:      { value: new THREE.Vector2(0.72, 0.4) },
    u_compact:    { value: compact ? 1 : 0 },
    u_base:       { value: new THREE.Color(colors.base) },
    u_c1:         { value: new THREE.Color(colors.c1) },
    u_c2:         { value: new THREE.Color(colors.c2) },
    u_c3:         { value: new THREE.Color(colors.c3) },
    u_c4:         { value: new THREE.Color(colors.c4) },
    u_c5:         { value: new THREE.Color(colors.c5) },
  }), [colors])

  useEffect(() => {
    uniforms.u_compact.value = compact ? 1 : 0
    invalidate()
  }, [compact, uniforms, invalidate])

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

  useFrame(({ clock, size }) => {
    uniforms.u_resolution.value.set(size.width, size.height)
    if (!animate) return
    uniforms.u_time.value = 6.0 + clock.getElapsedTime()
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

const DEFAULT_COLORS = {
  base: '#0B1330',
  c1: '#FFB561',
  c2: '#FF6F59',
  c3: '#E2448F',
  c4: '#8A4DF0',
  c5: '#3B2FC9',
}

export default function EmpresasRibbonBg({ colors = DEFAULT_COLORS }) {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [inView, setInView] = useState(true)
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches,
  )
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
        dpr={1}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'low-power',
          preserveDrawingBuffer: false,
          stencil: false,
          depth: false,
        }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 80 } }}
      >
        <RibbonPlane colors={colors} compact={compact} animate={animate} />
      </Canvas>
    </div>
  )
}
