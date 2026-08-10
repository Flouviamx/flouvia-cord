import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
  
  // Dynamic colors from props
  uniform vec3  u_colorBase;
  uniform vec3  u_color1;
  uniform vec3  u_color2;
  uniform vec3  u_color3;

  varying vec2  vUv;

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
    for(int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p  = p * 2.1 + vec3(5.2, 1.3, 8.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (vUv - 0.5) * aspect;

    float t = u_time * 0.3;

    vec2 mouse = (u_mouse - 0.5) * aspect;
    vec2 toMouse = uv - mouse;
    float mDist = length(toMouse);
    float mPull = exp(-mDist * 1.6);
    vec2 mPush = toMouse * mPull * 0.4;

    vec2 drift1 = vec2(t * 0.14, t * 0.06) + mPush;
    vec2 drift2 = vec2(-t * 0.10, t * 0.045) - mPush * 0.6;

    vec3 q = vec3(uv * 0.9 + drift1, t);
    float warpX = fbm(q + vec3(0.0, 0.0, t * 0.5));
    float warpY = fbm(q + vec3(5.2, 1.3, t * 0.5));
    vec2 w0 = vec2(warpX, warpY);

    vec3 q2 = vec3(uv + drift1 + w0 * 0.55, t * 0.85);
    float warpX2 = fbm(q2 + vec3(1.7, 9.2, 0.0));
    float warpY2 = fbm(q2 + vec3(8.3, 2.8, 1.1));
    vec2 w1 = vec2(warpX2, warpY2);

    float blob1 = fbm(vec3(uv + drift1 + w1 * 0.58, t * 0.85));
    blob1 = smoothstep(-0.12, 0.5, blob1);
    blob1 = pow(blob1, 1.5);

    vec3 q4 = vec3(uv * 0.6 + drift2 - w0 * 0.3, t * 0.6 + 7.5);
    float blob2 = fbm(q4 + vec3(3.1, 7.4, 0.0));
    blob2 = smoothstep(-0.12, 0.52, blob2);
    blob2 = pow(blob2, 1.5);

    vec2 drift3 = vec2(t * 0.09, -t * 0.05) + mPush * 0.5;
    vec3 q5 = vec3(uv * 0.46 + drift3 + w1 * 0.4, t * 0.5 + 2.3);
    float blob3 = fbm(q5 + vec3(9.4, 2.1, 0.0));
    blob3 = smoothstep(-0.14, 0.48, blob3);
    blob3 = pow(blob3, 1.6);
    float cornerTR = smoothstep(-0.5, 0.7, uv.x) * smoothstep(-0.5, 0.65, -uv.y + 0.15);
    blob3 = max(blob3 * 0.75, blob3 * 0.5 + cornerTR * 0.5 * blob3);

    vec2 drift4 = vec2(-t * 0.17, t * 0.1) - mPush * 0.4;
    vec3 q6 = vec3(uv * 1.15 + drift4 - w1 * 0.35, t * 1.05 + 11.8);
    float blob4 = fbm(q6 + vec3(6.6, 4.4, 1.7));
    blob4 = smoothstep(-0.1, 0.46, blob4);
    blob4 = pow(blob4, 1.7);
    float cornerBL = smoothstep(0.5, -0.7, uv.x) * smoothstep(0.5, -0.65, uv.y - 0.1);
    blob4 = max(blob4 * 0.7, blob4 * 0.45 + cornerBL * 0.45 * blob4);

    float breath1 = 0.8 + 0.2 * sin(u_time * 0.46);
    float breath2 = 0.72 + 0.28 * sin(u_time * 0.38 + 4.2);
    float breath3 = 0.76 + 0.24 * sin(u_time * 0.33 + 1.7);
    float breath4 = 0.7 + 0.3 * sin(u_time * 0.52 + 5.6);

    // ── Dynamic Color Blending ──
    vec3 color = mix(u_colorBase, u_color1, clamp(blob2 * 1.4, 0.0, 1.0));
    color = mix(color, u_color2, clamp(blob3 * 1.2, 0.0, 1.0));
    color = mix(color, u_color3, clamp(blob4 * 1.1, 0.0, 1.0)); 

    float glow = mPull * 0.22;
    float alpha = clamp(
        blob1 * 0.8 * breath1
      + blob2 * 0.7 * breath2
      + blob3 * 0.65 * breath3
      + blob4 * 0.6 * breath4
      + glow * blob1,
      0.0, 1.0
    );

    vec2 edgeUv = vUv * 2.0 - 1.0;
    float edge = 1.0 - smoothstep(0.85, 1.2, max(abs(edgeUv.x), abs(edgeUv.y)));
    alpha *= mix(0.8, 1.0, edge);

    gl_FragColor = vec4(color, alpha);
  }
`

function AuroraPlane({ colors }) {
  const { gl } = useThree()
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(1290, 560) },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
    u_colorBase:  { value: new THREE.Color(colors.base) },
    u_color1:     { value: new THREE.Color(colors.color1) },
    u_color2:     { value: new THREE.Color(colors.color2) },
    u_color3:     { value: new THREE.Color(colors.color3) },
  }), [colors])

  useEffect(() => {
    uniforms.u_colorBase.value.set(colors.base)
    uniforms.u_color1.value.set(colors.color1)
    uniforms.u_color2.value.set(colors.color2)
    uniforms.u_color3.value.set(colors.color3)
  }, [colors, uniforms])

  useEffect(() => {
    const el = gl.domElement
    // Cachea el bounding rect: leerlo en cada mousemove fuerza un reflow
    // síncrono del layout — con varias instancias montadas a la vez eso es
    // la causa principal del lag. Solo se recalcula cuando algo pudo haber
    // movido/redimensionado el elemento (scroll/resize/el propio contenedor).
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
  }, [gl])

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
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function CordDynamicBg({ 
  colors = {
    base: '#0F172A',
    color1: '#38BDF8',
    color2: '#6670F4',
    color3: '#10B981'
  },
  grain = true,
  maskImage,
  maskSize = 'contain',
  maskPosition = 'center',
  maskRepeat = 'no-repeat',
}) {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [inView, setInView] = useState(false)
  // Accesibilidad: con prefers-reduced-motion el Canvas NO se monta — queda el
  // fondo sólido `colors.base` (mismo criterio que los shaders viejos, que
  // hacían `if (reduced) return null`).
  const [reduced] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
    }, { threshold: 0.01, rootMargin: '200px 0px' })
    
    if (wrapRef.current) observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position:      'absolute',
        inset:         0,
        zIndex:        0,
        overflow:      'hidden',
        pointerEvents: 'none',
        backgroundColor: colors.base,
        opacity:       visible ? 1 : 0,
        transition:    'opacity 1s ease',
        ...(maskImage ? {
          WebkitMaskImage: `url(${maskImage})`,
          WebkitMaskPosition: maskPosition,
          WebkitMaskRepeat: maskRepeat,
          WebkitMaskSize: maskSize,
          WebkitMaskMode: 'alpha',
          maskImage: `url(${maskImage})`,
          maskPosition,
          maskRepeat,
          maskSize,
          maskMode: 'alpha',
        } : {}),
      }}
    >
      {inView && !reduced && (
        <Canvas
          style={{ position: 'absolute', inset: 0 }}
          orthographic
          dpr={1}
          camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
          gl={{
            antialias:             false,
            alpha:                 true,
            powerPreference:       'low-power',
            preserveDrawingBuffer: false,
            stencil:               false,
            depth:                 false,
          }}
          resize={{ scroll: false, debounce: { scroll: 50, resize: 80 } }}
        >
          <AuroraPlane colors={colors} />
        </Canvas>
      )}
      
      {grain && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10,
            opacity: 0.45,
            mixBlendMode: 'overlay',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }}
        />
      )}
    </div>
  )
}
