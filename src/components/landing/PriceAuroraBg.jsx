import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Aurora azul eléctrico — sin grano, estelas de azul claro sobre navy profundo
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
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

    // Paleta todo-azul — navy profundo · azul eléctrico · azul hielo
    vec3 colorBase  = vec3(0.033, 0.055, 0.122); // #08152a navy profundo
    vec3 colorBlue  = vec3(0.059, 0.388, 0.980); // #0f63fa azul eléctrico Cord
    vec3 colorIce   = vec3(0.380, 0.718, 1.000); // #61b7ff azul hielo/cielo

    float t = u_time * 0.55;

    // Mouse tracking
    vec2 mouse = (u_mouse - 0.5) * aspect;
    vec2 toMouse = uv - mouse;
    float mDist  = length(toMouse);
    float mPull  = exp(-mDist * 1.8);
    vec2  mPush  = toMouse * mPull * 0.38;

    // Deriva — las auroras viajan lentamente
    vec2 drift1 = vec2(t * 0.14,  t * 0.06) + mPush;
    vec2 drift2 = vec2(-t * 0.09, t * 0.04) - mPush * 0.6;

    // Domain warp
    vec3 q = vec3(uv * 0.9 + drift1, t);
    float wx = fbm(q + vec3(0.0, 0.0, t * 0.5));
    float wy = fbm(q + vec3(5.2, 1.3, t * 0.5));
    vec2  w0 = vec2(wx, wy);

    vec3 q2 = vec3(uv + drift1 + w0 * 0.5, t * 0.85);
    float wx2 = fbm(q2 + vec3(1.7, 9.2, 0.0));
    float wy2 = fbm(q2 + vec3(8.3, 2.8, 1.1));
    vec2  w1 = vec2(wx2, wy2);

    // Aurora principal — azul eléctrico, fluye desde arriba-derecha
    float blob1 = fbm(vec3(uv + drift1 + w1 * 0.55, t * 0.88));
    blob1 = smoothstep(-0.05, 0.62, blob1);
    blob1 = pow(blob1, 1.7);

    // Aurora secundaria — hielo/cielo, esquina superior izquierda
    vec3 q4 = vec3(uv * 0.62 + drift2 - w0 * 0.28, t * 0.58 + 7.5);
    float blob2 = fbm(q4 + vec3(3.1, 7.4, 0.0));
    blob2 = smoothstep(-0.05, 0.64, blob2);
    blob2 = pow(blob2, 2.2);
    // concentra el hielo en la esquina superior-derecha
    float corner = smoothstep(0.55, -0.25, uv.x - 0.3) * smoothstep(0.40, -0.25, uv.y - 0.2);
    blob2 = max(blob2, blob2 * 0.5 + corner * 0.45);

    // Breathing suave
    float breath1 = 0.76 + 0.24 * sin(u_time * 0.48);
    float breath2 = 0.65 + 0.35 * sin(u_time * 0.38 + 4.19);

    // Compositing — mezcla suave sin sobreexposición
    float glow = mPull * 0.18;
    vec3 color = colorBase;
    color = mix(color, colorBlue, clamp(blob1 * 0.60 * breath1 + glow * blob1, 0.0, 0.9));
    color = mix(color, colorIce,  clamp(blob2 * 0.38 * breath2, 0.0, 0.6));

    // Halo de cursor: refuerza el azul bajo el mouse
    float cursorHalo = mPull * 0.14;
    color = mix(color, colorIce, cursorHalo * blob1);

    // Viñeta suave
    float vig = 1.0 - dot(uv * 0.9, uv * 0.9);
    color *= clamp(pow(vig, 0.45), 0.0, 1.0);

    // Tonemap Reinhard
    color = color / (color + vec3(0.17));

    gl_FragColor = vec4(color, 1.0);
  }
`

function AuroraPlane() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))
  const isHovering = useRef(false)
  const hoverTimeout = useRef(null)

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(600, 400) },
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
      hoverTimeout.current = setTimeout(() => { isHovering.current = false }, 2500)
    }
    const onMove  = (e) => handleInteract(e.clientX, e.clientY)
    const onTouch = (e) => { if (e.touches.length > 0) handleInteract(e.touches[0].clientX, e.touches[0].clientY) }
    window.addEventListener('mousemove',  onMove,  { passive: true })
    window.addEventListener('touchmove',  onTouch, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    return () => {
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onTouch)
      window.removeEventListener('touchstart', onTouch)
      clearTimeout(hoverTimeout.current)
    }
  }, [])

  useFrame(({ clock, size }) => {
    const time = clock.getElapsedTime()
    uniforms.u_time.value = time
    uniforms.u_resolution.value.set(size.width, size.height)
    if (!isHovering.current) {
      mouseTarget.current.x = 0.5 + Math.sin(time * 0.35) * 0.28 + Math.sin(time * 0.6) * 0.1
      mouseTarget.current.y = 0.5 + Math.cos(time * 0.28) * 0.25
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

export default function PriceAuroraBg() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <Canvas
      style={{
        position:      'absolute',
        inset:         0,
        zIndex:        0,
        pointerEvents: 'none',
        borderRadius:  'inherit',
        opacity:       visible ? 1 : 0,
        transition:    'opacity 1s ease',
      }}
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      dpr={1}
      gl={{
        antialias:             false,
        powerPreference:       'low-power',
        preserveDrawingBuffer: false,
      }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
    >
      <AuroraPlane />
    </Canvas>
  )
}
