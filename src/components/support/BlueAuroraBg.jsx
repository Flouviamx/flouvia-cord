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

// ─── Fragment Shader — aurora atmosférica estilo ElevenLabs ───────────────────
// Blobs grandes y suaves, grano denso de película, paleta oceánica
const fragmentShader = /* glsl */`
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  varying vec2  vUv;

  // ── Simplex Noise 3D (Stefan Gustavson) ───────────────────────────────────
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);
    const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(
      i.z+vec4(0.,i1.z,i2.z,1.))
      +i.y+vec4(0.,i1.y,i2.y,1.))
      +i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=0.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;
    vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  // ── FBM atmosférico: solo 3 octavas, escala baja → blobs GRANDES ─────────
  float fbm(vec3 p){
    float v=0.,a=.5;
    for(int i=0;i<3;i++){
      v+=a*snoise(p);
      p=p*1.8+vec3(5.2,1.3,8.7);
      a*=.52;
    }
    return v;
  }

  // ── Grano de película: 2 capas (estática + animada) ──────────────────────
  // Así se consigue el grano denso de ElevenLabs
  float filmGrain(vec2 uv, float t){
    // capa estática: anclada al pixel
    vec2 p1 = uv * vec2(1920., 1080.);
    float g1 = fract(sin(dot(floor(p1), vec2(127.1, 311.7))) * 43758.5453);
    // capa animada: cambia ~24 fps
    vec2 p2 = uv * vec2(1920., 1080.) + fract(t * 24.) * 13.7;
    float g2 = fract(sin(dot(floor(p2), vec2(269.5, 183.3))) * 93421.631);
    return mix(g1, g2, 0.55);
  }

  void main(){
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (vUv - 0.5) * aspect;

    // ── Paleta oscura profunda (deep ocean / ElevenLabs) ──────────────────
    // base muy oscura: azul-carbón, casi negro
    vec3 cBase  = vec3(0.040, 0.058, 0.110);  // #0A0F1C
    // teal profundo izquierda (el color dominante de ElevenLabs)
    vec3 cTeal  = vec3(0.000, 0.290, 0.310);  // #004F4F — teal oscuro
    // azul cobalto centro-derecha: da el contraste frío
    vec3 cBlue  = vec3(0.050, 0.120, 0.380);  // #0D1E61
    // acento cyan muy sutil en el cursor / movimiento
    vec3 cCyan  = vec3(0.040, 0.380, 0.460);  // #0A6175

    float t = u_time * 0.40;  // más lento → más atmosférico

    // ── Mouse ─────────────────────────────────────────────────────────────
    vec2 mouse  = (u_mouse - 0.5) * aspect;
    vec2 toM    = uv - mouse;
    float mDist = length(toM);
    float mPull = exp(-mDist * 1.2);
    vec2  mPush = toM * mPull * 0.38;

    // ── Deriva (lenta, atmosférica) ───────────────────────────────────────
    vec2 d1 = vec2(t * 0.10,  t * 0.04)  + mPush;
    vec2 d2 = vec2(-t * 0.07, t * 0.03)  - mPush * 0.6;
    vec2 d3 = vec2(t * 0.05, -t * 0.06)  + mPush * 0.3;

    // ── Escala UVs MUY BAJA → blobs enormes y suaves ─────────────────────
    float sc = 0.42;  // << la clave: blobs el doble de grandes que antes

    // Warp suave (solo 1 capa)
    vec3 qw = vec3(uv * sc + d1, t);
    float wx = fbm(qw + vec3(0., 0., t * 0.3));
    float wy = fbm(qw + vec3(5.2, 1.3, t * 0.3));
    vec2  w  = vec2(wx, wy) * 0.40;

    // ── Blob 1: teal — izquierda y arriba (dominante) ─────────────────────
    float b1 = fbm(vec3((uv + d1 + w) * sc, t * 0.80));
    // smoothstep muy ancho → bordes extremadamente difusos
    b1 = smoothstep(-0.30, 0.55, b1);
    b1 = pow(b1, 1.6);

    // ── Blob 2: azul cobalto — centro-derecha ─────────────────────────────
    float b2 = fbm(vec3((uv * 0.62 + d2 - w * 0.25) * sc, t * 0.70 + 2.1));
    b2 = smoothstep(-0.30, 0.52, b2);
    b2 = pow(b2, 1.8);

    // ── Blob 3: cyan — sigue el cursor (halo interactivo) ─────────────────
    float b3 = fbm(vec3((uv * 0.50 + d3 + w * 0.15) * sc, t * 0.60 + 4.5));
    b3 = smoothstep(-0.28, 0.50, b3);
    b3 = pow(b3, 2.2);
    // bonus: concentrar el cyan donde está el cursor
    b3 = max(b3, mPull * 0.45);

    // ── Breathing desfasado ───────────────────────────────────────────────
    float br1 = 0.70 + 0.30 * sin(u_time * 0.38);
    float br2 = 0.65 + 0.35 * sin(u_time * 0.29 + 2.09);
    float br3 = 0.60 + 0.40 * sin(u_time * 0.33 + 4.71);

    // ── Compositing ───────────────────────────────────────────────────────
    vec3 color = cBase;
    color = mix(color, cTeal, clamp(b1 * 0.68 * br1, 0., 1.));
    color = mix(color, cBlue, clamp(b2 * 0.52 * br2, 0., 1.));
    color = mix(color, cCyan, clamp(b3 * 0.36 * br3, 0., 1.));

    // ── Viñeta radial suave ───────────────────────────────────────────────
    float vig = 1.0 - dot(uv * 0.70, uv * 0.70);
    color *= clamp(pow(vig, 0.40), 0.0, 1.0);

    // ── Fade superior → más oscuro arriba (como ElevenLabs bajo el navbar) ─
    float topFade = smoothstep(0.0, 0.45, vUv.y);
    color *= mix(0.30, 1.0, topFade);

    // ── Grano de película DENSO ───────────────────────────────────────────
    // Dos pasadas: grano fino + grano más grueso → textura real de película
    float gFine  = filmGrain(vUv,                u_time) - 0.5;
    float gCoarse= filmGrain(vUv * 0.38 + 0.1,  u_time) - 0.5;
    float grain  = gFine * 0.70 + gCoarse * 0.30;
    // Intensidad: ~x2.5 del original (0.008 base → 0.020)
    color += grain * 0.020;

    // ── Tonemap suave ─────────────────────────────────────────────────────
    color = color / (color + vec3(0.16));

    gl_FragColor = vec4(color, 1.0);
  }
`

function AuroraPlane() {
  const meshRef = useRef()
  const mouseTarget  = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseSmooth  = useRef(new THREE.Vector2(0.5, 0.5))
  const isInteracting = useRef(false)
  const idleTimer     = useRef(null)

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(800, 350) },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
  }), [])

  useEffect(() => {
    const set = (cx, cy) => {
      isInteracting.current = true
      mouseTarget.current.set(cx / window.innerWidth, 1.0 - cy / window.innerHeight)
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => { isInteracting.current = false }, 3500)
    }
    const onMove  = (e) => set(e.clientX, e.clientY)
    const onTouch = (e) => { if (e.touches[0]) set(e.touches[0].clientX, e.touches[0].clientY) }
    window.addEventListener('mousemove',  onMove,   { passive: true })
    window.addEventListener('touchmove',  onTouch,  { passive: true })
    window.addEventListener('touchstart', onTouch,  { passive: true })
    return () => {
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onTouch)
      window.removeEventListener('touchstart', onTouch)
      clearTimeout(idleTimer.current)
    }
  }, [])

  useFrame(({ clock, size }) => {
    const time = clock.getElapsedTime()
    uniforms.u_time.value = time
    uniforms.u_resolution.value.set(size.width, size.height)
    if (!isInteracting.current) {
      // Movimiento autónomo lento — siempre activo en móvil
      mouseTarget.current.x = 0.5 + Math.sin(time * 0.22) * 0.32 + Math.sin(time * 0.41) * 0.10
      mouseTarget.current.y = 0.5 + Math.cos(time * 0.18) * 0.25 + Math.cos(time * 0.33) * 0.09
    }
    // Lerp muy lento (0.03) → movimiento líquido y perezoso
    mouseSmooth.current.lerp(mouseTarget.current, 0.03)
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

export default function BlueAuroraBg() {
  const wrapRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const [reduced] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: '140px' },
    )
    io.observe(wrapRef.current)
    return () => io.disconnect()
  }, [])

  if (reduced) return null

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position:      'absolute',
        inset:         0,
        zIndex:        1,
        pointerEvents: 'none',
        opacity:       visible ? 1 : 0,
        transition:    'opacity 1.2s ease',
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        orthographic
        camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
        gl={{
          antialias:             false,
          powerPreference:       'low-power',
          preserveDrawingBuffer: false,
        }}
        dpr={1}
        frameloop={onScreen ? 'always' : 'never'}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
      >
        <AuroraPlane />
      </Canvas>
    </div>
  )
}
