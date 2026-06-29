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
// Misma paleta que el usuario aprobó, con movimiento mucho más evidente.
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
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

    // ── Paleta (azul medianoche · teal esmeralda + acento índigo) ─────────
    vec3 colorBase   = vec3(0.043, 0.059, 0.098); // #0B0F19
    vec3 colorTeal   = vec3(0.000, 0.290, 0.205); // esmeralda muy oscuro
    vec3 colorIndigo = vec3(0.105, 0.040, 0.250); // índigo, acento

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

    // ── Compositing (teal principal + acento índigo) ──────────────────────
    // mix BAJO → glow teal tenue (no humo brillante); halo del cursor sutil
    float glow = mPull * 0.22;
    vec3 color = colorBase;
    color = mix(color, colorTeal,   clamp(blob1 * 0.55 * breath1 + glow * blob1, 0.0, 1.0));
    color = mix(color, colorIndigo, blob3 * 0.55 * breath3);

    // ── Viñeta ────────────────────────────────────────────────────────────
    float vig = 1.0 - dot(uv * 0.88, uv * 0.88);
    color *= clamp(pow(vig, 0.50), 0.0, 1.0);

    // ── Film Grain ────────────────────────────────────────────────────────
    color += (grain(vUv, u_time) - 0.5) * 0.030;

    // ── Tonemap ───────────────────────────────────────────────────────────
    color = color / (color + vec3(0.17));

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Mesh fullscreen ─────────────────────────────────────────────────────────
function AuroraPlane() {
  const meshRef = useRef()
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

  useFrame(({ clock, size }) => {
    uniforms.u_time.value = clock.getElapsedTime()
    uniforms.u_resolution.value.set(size.width, size.height)
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
export default function DarkAuroraBg() {
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
      <AuroraPlane />
    </Canvas>
  )
}
