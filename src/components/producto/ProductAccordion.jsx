import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import './ProductAccordion.css';

// ── GLSL — FBM 5 octavas + domain warp doble (igual a BlogCover) ─────────────
const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform vec3  u_ca;
uniform vec3  u_cb;
uniform vec3  u_cc;

vec2 hash2(vec2 p) {
  p = fract(p * vec2(5.3983, 5.4427));
  p += dot(p.yx, p + vec2(21.535, 14.314));
  return fract(vec2(p.x * p.y * 95.434, p.x * p.y * 97.597));
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash2(i)           * 2.0 - 1.0, f);
  float b = dot(hash2(i+vec2(1,0)) * 2.0 - 1.0, f - vec2(1,0));
  float c = dot(hash2(i+vec2(0,1)) * 2.0 - 1.0, f - vec2(0,1));
  float d = dot(hash2(i+vec2(1,1)) * 2.0 - 1.0, f - vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p); p = p * 2.13 + vec2(13.72, 5.29); a *= 0.46;
  }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.y = 1.0 - uv.y;
  uv += u_mouse * 0.05;
  float t = u_time * 0.10;
  vec2 q = vec2(fbm(uv*2.2+t), fbm(uv*2.2+vec2(5.23,1.31)+t*0.82));
  vec2 r = vec2(fbm(uv*1.6+q*0.9+vec2(1.71,9.25)+t*0.60), fbm(uv*1.6+q*0.9+vec2(8.31,2.82)+t*0.42));
  float f = fbm(uv + r) * 0.5 + 0.5;
  float y = clamp(uv.y * 0.75 + fbm(uv*2.8+t*0.28)*0.32 + 0.08, 0.0, 1.0);
  vec3 col = mix(u_ca, u_cb, smoothstep(0.0, 0.55, y));
  col = mix(col, u_cc, smoothstep(0.40, 1.0, y + f*0.22));
  col += (f - 0.5) * 0.055;
  float vig = clamp(1.0 - length((uv-0.5)*1.5), 0.0, 1.0); vig *= vig;
  col *= vig * 0.28 + 0.72;
  col += u_cc * exp(-length(uv - vec2(0.5,0.4))*3.5) * 0.09;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453) - 0.5) * 0.022;
  col = col / (col + 0.35);
  gl_FragColor = vec4(pow(clamp(col,0.0,1.0), vec3(0.90)), 1.0);
}
`;

// ── 4 paletas azul-navy (todas en el mismo espectro, cada una con carácter propio) ─
const CARD_PALS = [
  [[0.04, 0.10, 0.24], [0.09, 0.24, 0.54], [0.20, 0.50, 0.96]],
  [[0.03, 0.07, 0.20], [0.10, 0.17, 0.48], [0.24, 0.40, 0.96]],
  [[0.04, 0.11, 0.26], [0.07, 0.26, 0.58], [0.13, 0.52, 0.97]],
  [[0.02, 0.06, 0.18], [0.10, 0.22, 0.54], [0.28, 0.52, 0.98]],
];

// ── Tamaños en reposo distintos por posición ─────────────────────────────────
const RESTING     = [0.85, 1.55, 1.10, 1.75];
const ACTIVE_GROW = 6.5;

// ── CardShader — canvas FIJO para eliminar el flash negro ────────────────────
// Renderiza a 480×560px siempre. CSS lo estira con width/height 100%.
// Nunca se asigna canvas.width/height durante la animación → sin reset WebGL.
function CardShader({ palette }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const gl = canvas.getContext('webgl', {
      antialias: false, powerPreference: 'low-power', alpha: false,
    });
    if (!gl) return;

    // Tamaño fijo — nunca vuelve a cambiar
    canvas.width  = Math.round(480 * dpr);
    canvas.height = Math.round(560 * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Programa GLSL
    function mkShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), canvas.width, canvas.height);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_ca'), palette[0]);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_cb'), palette[1]);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_cc'), palette[2]);

    const st = { running: false, raf: null, mx: 0, my: 0, tx: 0, ty: 0 };

    function render(ts) {
      if (!st.running) return;
      if (!reduced) {
        st.mx += (st.tx - st.mx) * 0.055;
        st.my += (st.ty - st.my) * 0.055;
        gl.uniform1f(uTime, ts * 0.001);
        gl.uniform2f(uMouse, st.mx, st.my);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      st.raf = requestAnimationFrame(render);
    }

    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { st.running = true; st.raf = requestAnimationFrame(render); }
      else { st.running = false; cancelAnimationFrame(st.raf); }
    }, { threshold: 0.05 });
    io.observe(canvas);

    function onMouse(e) {
      const rect = canvas.getBoundingClientRect();
      st.tx =  (e.clientX - rect.left) / rect.width  * 2 - 1;
      st.ty = -((e.clientY - rect.top) / rect.height * 2 - 1);
    }
    window.addEventListener('mousemove', onMouse, { passive: true });

    return () => {
      st.running = false;
      cancelAnimationFrame(st.raf);
      io.disconnect();
      window.removeEventListener('mousemove', onMouse);
      try { gl.deleteProgram(prog); gl.deleteBuffer(buf); } catch (_) {}
    };
  }, []);

  return <canvas ref={canvasRef} className="pac-shader-canvas" />;
}

// ── Iconos Apple SF Symbols — Duotone glass premium ──────────────────────────
const ICONS = {
  sparkle: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3 L17.9 12.4 L27 16 L17.9 19.6 L16 29 L14.1 19.6 L5 16 L14.1 12.4 Z"
        fill="currentColor" fillOpacity="0.18"/>
      <path d="M16 3 L17.9 12.4 L27 16 L17.9 19.6 L16 29 L14.1 19.6 L5 16 L14.1 12.4 Z"/>
      <circle cx="16" cy="16" r="2.8" fill="currentColor" fillOpacity="0.60"/>
      <path d="M25 5.5 L25.7 7.8 L28 8.5 L25.7 9.2 L25 11.5 L24.3 9.2 L22 8.5 L24.3 7.8 Z"
        fill="currentColor" fillOpacity="0.50" stroke="none"/>
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4 H15 L28 17 A2.8 2.8 0 0 1 28 21 L21 28 A2.8 2.8 0 0 1 17 28 L4 15 Z"
        fill="currentColor" fillOpacity="0.16"/>
      <path d="M4 4 H15 L28 17 A2.8 2.8 0 0 1 28 21 L21 28 A2.8 2.8 0 0 1 17 28 L4 15 Z"/>
      <circle cx="10.5" cy="10.5" r="2.2" fill="currentColor" fillOpacity="0.55"/>
      <line x1="18" y1="15" x2="23.5" y2="20.5" strokeOpacity="0.45" strokeWidth="1.4"/>
      <line x1="14" y1="19" x2="19.5" y2="24.5" strokeOpacity="0.28" strokeWidth="1.2"/>
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="16,20 29,14.5 16,9 3,14.5" fill="currentColor" fillOpacity="0.12"/>
      <polygon points="16,14 29,8.5 16,3 3,8.5" fill="currentColor" fillOpacity="0.24"/>
      <polyline points="3,20 16,26 29,20"/>
      <polyline points="3,14.5 16,20.5 29,14.5"/>
      <polyline points="3,8.5 16,3 29,8.5"/>
    </svg>
  ),
  calculator: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="22" height="26" rx="3.5" fill="currentColor" fillOpacity="0.13"/>
      <rect x="5" y="3" width="22" height="26" rx="3.5"/>
      <rect x="9" y="7" width="14" height="5.5" rx="1.5" fill="currentColor" fillOpacity="0.30"/>
      <circle cx="10.5" cy="18.5" r="1.5" fill="currentColor" fillOpacity="0.50"/>
      <circle cx="16"   cy="18.5" r="1.5" fill="currentColor" fillOpacity="0.50"/>
      <circle cx="21.5" cy="18.5" r="1.5" fill="currentColor" fillOpacity="0.50"/>
      <circle cx="10.5" cy="24"   r="1.5" fill="currentColor" fillOpacity="0.35"/>
      <circle cx="16"   cy="24"   r="1.5" fill="currentColor" fillOpacity="0.35"/>
      <rect x="19.5" y="22.5" width="4" height="3" rx="1" fill="currentColor" fillOpacity="0.55"/>
    </svg>
  ),
  check_circle: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="13" fill="currentColor" fillOpacity="0.13"/>
      <circle cx="16" cy="16" r="13"/>
      <circle cx="16" cy="16" r="9" fill="currentColor" fillOpacity="0.10"/>
      <polyline points="9.5,16.5 14,21 22.5,11" strokeWidth="2.2"/>
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16 C6 8 11 5 16 5 C21 5 26 8 30 16 C26 24 21 27 16 27 C11 27 6 24 2 16 Z"
        fill="currentColor" fillOpacity="0.14"/>
      <path d="M2 16 C6 8 11 5 16 5 C21 5 26 8 30 16 C26 24 21 27 16 27 C11 27 6 24 2 16 Z"/>
      <circle cx="16" cy="16" r="5.5" fill="currentColor" fillOpacity="0.22"/>
      <circle cx="16" cy="16" r="5.5"/>
      <circle cx="16" cy="16" r="2.5" fill="currentColor" fillOpacity="0.65"/>
      <circle cx="18.2" cy="13.8" r="1.0" fill="currentColor" fillOpacity="0.55" stroke="none"/>
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3 V29 L9.3 26.5 L12.7 29 L16 26.5 L19.3 29 L22.7 26.5 L26 29 V3 Z"
        fill="currentColor" fillOpacity="0.13"/>
      <path d="M6 3 V29 L9.3 26.5 L12.7 29 L16 26.5 L19.3 29 L22.7 26.5 L26 29 V3 Z"/>
      <line x1="10" y1="10"   x2="22" y2="10"   strokeOpacity="0.55"/>
      <line x1="10" y1="14.5" x2="22" y2="14.5" strokeOpacity="0.40"/>
      <line x1="10" y1="19"   x2="18" y2="19"   strokeOpacity="0.30"/>
      <line x1="10" y1="23"   x2="22" y2="23"   strokeWidth="2.2" strokeOpacity="0.70"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="5" fill="currentColor" fillOpacity="0.22"/>
      <circle cx="12" cy="10" r="5"/>
      <path d="M3 28 V25 A7 7 0 0 1 21 25 V28" fill="currentColor" fillOpacity="0.14"/>
      <path d="M3 28 V25 A7 7 0 0 1 21 25 V28"/>
      <circle cx="23" cy="9" r="3.5" fill="currentColor" fillOpacity="0.18"/>
      <circle cx="23" cy="9" r="3.5"/>
      <path d="M22 28 C22 23 26 20 29 20" strokeOpacity="0.55"/>
    </svg>
  ),
  robot: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="24" height="17" rx="4" fill="currentColor" fillOpacity="0.14"/>
      <rect x="4" y="11" width="24" height="17" rx="4"/>
      <rect x="12" y="3" width="8" height="8" rx="2" fill="currentColor" fillOpacity="0.20"/>
      <rect x="12" y="3" width="8" height="8" rx="2"/>
      <line x1="16" y1="3" x2="16" y2="1.5" strokeWidth="2"/>
      <circle cx="16" cy="1.5" r="1.2" fill="currentColor"/>
      <rect x="9.5" y="16" width="4.5" height="4" rx="1.5" fill="currentColor" fillOpacity="0.50"/>
      <rect x="18"   y="16" width="4.5" height="4" rx="1.5" fill="currentColor" fillOpacity="0.50"/>
      <path d="M11.5 24 H20.5" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="1.5" y1="17" x2="4"    y2="17" strokeOpacity="0.55"/>
      <line x1="28"  y1="17" x2="30.5" y2="17" strokeOpacity="0.55"/>
    </svg>
  ),
  currency: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="13" fill="currentColor" fillOpacity="0.12"/>
      <circle cx="16" cy="16" r="13"/>
      <path d="M21 10.5 H12.5 A4 4 0 0 0 12.5 18.5 H19.5 A4 4 0 0 1 19.5 26.5 H10"
        strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="7"    x2="16" y2="10.5" strokeWidth="2"/>
      <line x1="16" y1="24.5" x2="16" y2="28"   strokeWidth="2"/>
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4"  y="17" width="6" height="11" rx="1.5" fill="currentColor" fillOpacity="0.22"/>
      <rect x="13" y="10" width="6" height="18" rx="1.5" fill="currentColor" fillOpacity="0.22"/>
      <rect x="22" y="4"  width="6" height="24" rx="1.5" fill="currentColor" fillOpacity="0.22"/>
      <rect x="4"  y="17" width="6" height="11" rx="1.5"/>
      <rect x="13" y="10" width="6" height="18" rx="1.5"/>
      <rect x="22" y="4"  width="6" height="24" rx="1.5"/>
      <polyline points="7,17 16,10 25,4" strokeWidth="2" strokeOpacity="0.65"/>
      <circle cx="25" cy="4" r="2.5" fill="currentColor" fillOpacity="0.60" stroke="none"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3 L28 8 V16 C28 23.5 16 29 16 29 C16 29 4 23.5 4 16 V8 Z"
        fill="currentColor" fillOpacity="0.15"/>
      <path d="M16 3 L28 8 V16 C28 23.5 16 29 16 29 C16 29 4 23.5 4 16 V8 Z"/>
      <path d="M16 9 L22 11.5 V16 C22 19.5 16 22 16 22 C16 22 10 19.5 10 16 V11.5 Z"
        fill="currentColor" fillOpacity="0.18"/>
      <polyline points="12,15.5 15,19 20,12.5" strokeWidth="2"/>
    </svg>
  ),
  git_branch: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8"  cy="6.5"  r="3.5" fill="currentColor" fillOpacity="0.28"/>
      <circle cx="8"  cy="6.5"  r="3.5"/>
      <circle cx="24" cy="6.5"  r="3.5" fill="currentColor" fillOpacity="0.28"/>
      <circle cx="24" cy="6.5"  r="3.5"/>
      <circle cx="8"  cy="25.5" r="3.5" fill="currentColor" fillOpacity="0.28"/>
      <circle cx="8"  cy="25.5" r="3.5"/>
      <line x1="8" y1="10" x2="8" y2="22"/>
      <path d="M24 10 C24 17 15 20 8 22"/>
      <line x1="8" y1="6.5" x2="24" y2="6.5" strokeOpacity="0.35" strokeDasharray="2 2.5"/>
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="13" fill="currentColor" fillOpacity="0.12"/>
      <circle cx="16" cy="16" r="13"/>
      <ellipse cx="16" cy="16" rx="5.5" ry="13" fill="currentColor" fillOpacity="0.10"/>
      <ellipse cx="16" cy="16" rx="5.5" ry="13"/>
      <line x1="3" y1="16" x2="29" y2="16" strokeOpacity="0.55"/>
      <path d="M5 10 Q16 12 27 10" strokeOpacity="0.40"/>
      <path d="M5 22 Q16 20 27 22" strokeOpacity="0.40"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="14" width="22" height="15" rx="3.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="5" y="14" width="22" height="15" rx="3.5"/>
      <path d="M10 14 V10 A6 6 0 0 1 22 10 V14"/>
      <circle cx="16" cy="20.5" r="3" fill="currentColor" fillOpacity="0.40"/>
      <circle cx="16" cy="20.5" r="3"/>
      <line x1="16" y1="23.5" x2="16" y2="26.5" strokeWidth="2"/>
    </svg>
  ),
  trending: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,25 12,14.5 18,20.5 29,7 22,7" fill="currentColor" fillOpacity="0.15"/>
      <path d="M3 25 L12 14.5 L18 20.5 L29 7" strokeWidth="2"/>
      <polyline points="22,7 29,7 29,14"/>
      <circle cx="29" cy="7" r="2.5" fill="currentColor" fillOpacity="0.55" stroke="none"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M25 12 A9 9 0 0 0 7 12 C7 21 3 24 3 24 H29 C29 24 25 21 25 12 Z"
        fill="currentColor" fillOpacity="0.14"/>
      <path d="M25 12 A9 9 0 0 0 7 12 C7 21 3 24 3 24 H29 C29 24 25 21 25 12 Z"/>
      <path d="M13 24 A3 3 0 0 0 19 24"/>
      <circle cx="24" cy="8" r="4.5" fill="currentColor" fillOpacity="0.80"/>
      <circle cx="24" cy="8" r="4.5" strokeWidth="1.5"/>
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="18,3 5,18.5 15,18.5 14,29 27,13.5 17,13.5"
        fill="currentColor" fillOpacity="0.22"/>
      <polygon points="18,3 5,18.5 15,18.5 14,29 27,13.5 17,13.5"/>
    </svg>
  ),
};

// ── Datos: 4 slides por producto ─────────────────────────────────────────────
const SLIDES = {
  editor: [
    { label: '01', title: 'Cotización lista en 30 segundos', sub: 'Escribe el pedido con tus palabras. La IA lo empareja con tu catálogo, asigna precios por volumen y entrega la cotización lista para revisar y enviar.', icon: 'sparkle' },
    { label: '02', title: 'Un precio único para cada cliente', sub: 'Ajusta cualquier línea individualmente. El descuento y el precio de lista siempre visibles — sabes exactamente cuánto cediste antes de confirmar.', icon: 'tag' },
    { label: '03', title: 'Tu catálogo trabaja por ti', sub: 'Búsqueda instantánea por nombre o SKU. Los escalones de precio por volumen se aplican solos al cambiar la cantidad — sin calculadoras manuales.', icon: 'layers' },
    { label: '04', title: 'IVA y totales sin errores de dedo', sub: 'Subtotal, IVA configurable y total recalculados en tiempo real. Folio consecutivo, vigencia automática y margen bruto por línea visible al vendedor.', icon: 'calculator' },
  ],
  'link-publico': [
    { label: '01', title: 'Aprueba sin crear cuenta', sub: 'El cliente abre el link desde WhatsApp o correo, revisa la cotización con tu marca y aprueba con un botón. Sin registros, sin apps, sin PDF adjunto.', icon: 'check_circle' },
    { label: '02', title: 'Tu logo, tu marca, tu experiencia', sub: 'Logo, colores y nombre de tu negocio presiden la página pública. En planes de pago desaparece el "Powered by Cord" — la experiencia es 100% tuya.', icon: 'shield' },
    { label: '03', title: 'Firma legal en cada aprobación', sub: 'El cliente firma con nombre completo. Timestamp, dirección IP y hash SHA-256 del documento quedan registrados — evidencia con validez jurídica.', icon: 'lock' },
    { label: '04', title: 'Del sí al pago en segundos', sub: 'El cliente aprueba y puede pagar con tarjeta ahí mismo vía Stripe. Sin salir de la cotización, sin enviar datos bancarios por WhatsApp.', icon: 'zap' },
  ],
  seguimiento: [
    { label: '01', title: 'Sabes el momento exacto en que la ven', sub: 'Notificación en cuanto tu cliente abre el link. Fecha, hora y número de vistas — para llamar cuando la cotización está fresca en su cabeza.', icon: 'bell' },
    { label: '02', title: 'Toda la historia en un solo hilo', sub: 'Creada, enviada, vista, aprobada, pagada, facturada. Cualquier miembro del equipo entiende el estado en segundos, sin preguntar por WhatsApp.', icon: 'eye' },
    { label: '03', title: 'Tu pipeline real, no el de la libreta', sub: 'KPIs en vivo: monto por cerrar, cerrado en el mes y tasa de conversión. Detecta cotizaciones próximas a vencer antes de que el cliente las olvide.', icon: 'chart' },
    { label: '04', title: 'Ves cuando está revisando ahora mismo', sub: 'Indicador discreto "Viendo ahora" cuando el cliente tiene el link abierto en ese momento — el instante perfecto para dar seguimiento.', icon: 'trending' },
  ],
  cfdi: [
    { label: '01', title: 'De cotización aprobada a factura', sub: 'Los datos ya están capturados: productos, cantidades, precios y RFC del cliente. Timbrar es un clic — sin recapturar nada en otro portal del SAT.', icon: 'zap' },
    { label: '02', title: 'Tu CSD conectado una vez para siempre', sub: 'Sube tu Certificado de Sello Digital una sola vez. Queda cifrado y aislado en tu cuenta. Cada timbrado posterior usa tu sello automáticamente.', icon: 'lock' },
    { label: '03', title: 'UUID timbrado y válido ante el SAT', sub: 'CFDI 4.0 real con UUID del SAT, XML y PDF disponibles al instante. Timbrado a través de PAC autorizado — cumplimiento fiscal sin complicaciones.', icon: 'receipt' },
    { label: '04', title: 'Cotización, pago y factura juntos', sub: 'La factura queda ligada a su cotización en el timeline. Cuando contabilidad pregunte — quién aprobó, cuándo pagó y el UUID — todo en el mismo lugar.', icon: 'check_circle' },
  ],
  'clientes-credito': [
    { label: '01', title: 'Una ficha que lo dice todo', sub: 'Empresa, contacto, RFC, régimen fiscal, términos de pago y límite de crédito en un solo perfil. Todo el equipo cotiza con las mismas condiciones pactadas.', icon: 'users' },
    { label: '02', title: 'Límite de crédito visible antes de cotizar', sub: 'Asigna un límite en pesos por cliente. Antes de enviar, el sistema muestra cuánto espacio de crédito le queda — el "se nos pasó" deja de existir.', icon: 'shield' },
    { label: '03', title: 'Net 30 o Net 60 que se aplican solos', sub: 'El término de crédito queda guardado en la ficha del cliente. Al cotizarle aparece automáticamente — sin que el vendedor tenga que recordar el trato.', icon: 'tag' },
    { label: '04', title: 'Los buenos clientes se notan', sub: 'Historial completo de cotizaciones, aprobaciones y pagos por cliente. Decide con evidencia a quién dar mejores precios y a quién ajustar las condiciones.', icon: 'trending' },
  ],
  'cobranza-ia': [
    { label: '01', title: 'Tu cobrador trabaja de noche', sub: 'La IA contacta clientes deudores por correo, entiende la respuesta y negocia un plan de hasta 3 cuotas mensuales dentro de los límites que tú defines.', icon: 'robot' },
    { label: '02', title: 'Flujo de caja proyectado a 90 días', sub: 'Cord cruza el retraso real de pago de cada cliente con tu pipeline ponderado para estimar tus ingresos semana a semana, con escenarios de probabilidad.', icon: 'chart' },
    { label: '03', title: 'La IA propone. Tú apruebas.', sub: 'Activación opt-in cliente por cliente. Defines hasta dónde puede negociar el agente y supervisas cada conversación desde el tablero de control.', icon: 'shield' },
    { label: '04', title: 'Cada acuerdo en el audit log inmutable', sub: 'Cada correo enviado, cada cuota acordada y cada rechazo quedan registrados. Supervisión total del agente — nunca es una caja negra.', icon: 'receipt' },
  ],
  divisas: [
    { label: '01', title: 'Tu cliente ve dólares. El SAT ve pesos.', sub: 'La moneda de presentación y la fiscal son independientes. El cliente aprueba en USD o EUR; tú facturas en MXN — todo en la misma cotización.', icon: 'currency' },
    { label: '02', title: 'El tipo de cambio del día, no del Excel', sub: 'Tasa spot en vivo desde el Banco Central Europeo. Preview instantáneo del tipo de cambio mientras armas la cotización — sin capturar nada manual.', icon: 'globe' },
    { label: '03', title: 'La tasa se congela 30 días', sub: 'Una vez creada la cotización, el tipo de cambio queda congelado 30 días. Aprueba hoy o factura en tres semanas — el número que cerraste es el que cobras.', icon: 'lock' },
    { label: '04', title: 'Buffer que protege tu margen', sub: 'Cord suma un porcentaje extra a la tasa spot (ajustable) para absorber la volatilidad. El margen prometido sobrevive al movimiento del dólar.', icon: 'shield' },
  ],
  internacional: [
    { label: '01', title: 'El dólar se mueve. Tu margen no.', sub: 'Tasa spot real del BCE más el buffer de cobertura que configures, congelada 30 días. El margen pactado sobrevive a la volatilidad del tipo de cambio.', icon: 'shield' },
    { label: '02', title: 'Cotizas en la moneda del cliente', sub: 'Divisa de presentación para el cliente extranjero y divisa fiscal para facturar en México. Cord guarda ambas y la tasa congelada en la misma cotización.', icon: 'globe' },
    { label: '03', title: 'México timbra de verdad', sub: 'Cuando el trato cierra en México, Cord emite CFDI 4.0 real ante el SAT vía Facturapi: UUID, XML y PDF timbrados. El ciclo fiscal resuelto de punta a punta.', icon: 'receipt' },
    { label: '04', title: 'Arquitectura lista para crecer', sub: 'Un patrón de proveedores fiscales enruta cada emisión según el país. Las emisiones se centralizan en un registro unificado — preparado para sumar mercados.', icon: 'layers' },
  ],
  finanzas: [
    { label: '01', title: 'El retraso real, no el teórico', sub: 'Cord no asume que Net 30 se paga al día 30. Analiza el historial de cada cliente y proyecta con el retraso efectivo — no con la promesa del contrato.', icon: 'chart' },
    { label: '02', title: 'Sabes cuánto cobrarás antes de cobrarlo', sub: 'Pipeline ponderado más historial de pago real da una proyección a 90 días semana a semana. Escenarios de probabilidad, no solo el optimista que nadie cumple.', icon: 'trending' },
    { label: '03', title: 'Alerta antes de que el cheque rebote', sub: 'Si un cliente que representa el 40% de tu cartera empieza a atrasarse, el AI CFO te lo dice antes. Semáforo de concentración de riesgo en vivo.', icon: 'bell' },
    { label: '04', title: 'La junta de finanzas en segundos', sub: 'Tablero con KPIs, proyección semanal y ranking de clientes ponderado. Lo que antes tomaba horas de Excel, actualizado con cada nueva cotización.', icon: 'receipt' },
  ],
  aprobaciones: [
    { label: '01', title: 'Reglas claras para todo el equipo', sub: 'Configura que un vendedor puede dar hasta 10% de descuento. Todo lo que supere ese umbral se pausa automáticamente y requiere aprobación antes de salir.', icon: 'shield' },
    { label: '02', title: 'Validación que no interrumpe', sub: 'La validación ocurre en segundo plano. Solo actúa cuando algo sale del rango — el equipo comercial cierra, tú cuidas el margen sin ser el cuello de botella.', icon: 'eye' },
    { label: '03', title: 'Aprueba desde el celular en segundos', sub: 'Notificación instantánea cuando una cotización rebasa el umbral. Ves cuánto cedió el vendedor y apruebas o rechazas con un clic desde donde estés.', icon: 'check_circle' },
    { label: '04', title: 'Quién aprobó, cuándo y por qué', sub: 'El timeline guarda quién pidió la aprobación, quién la otorgó y a qué hora. Cero ambigüedad sobre por qué un precio salió más bajo de lo habitual.', icon: 'receipt' },
  ],
  equipo: [
    { label: '01', title: 'Cada quien ve solo lo que le toca', sub: 'El vendedor solo ve su cartera. El gerente ve el pipeline completo. El contador descarga CFDI. Roles predefinidos y permisos granulares para cada función.', icon: 'users' },
    { label: '02', title: 'Varias marcas, un solo panel', sub: 'Si tu corporativo opera con varias razones sociales o RFC, cambias de empresa con un clic. Catálogos y sellos fiscales aislados, reportes consolidados o individuales.', icon: 'layers' },
    { label: '03', title: 'Login con Google o Microsoft', sub: 'Tu equipo entra con las credenciales del dominio corporativo. Si alguien sale de la empresa, lo desactivas en Google Workspace y pierde acceso a Cord de inmediato.', icon: 'shield' },
    { label: '04', title: '100% de las acciones registradas', sub: 'Audit log inmutable: quién cotizó, quién aprobó, quién modificó un precio y cuándo. Trazabilidad total para auditorías, disputas y cumplimiento.', icon: 'receipt' },
  ],
  negociacion: [
    { label: '01', title: 'Negocia producto por producto', sub: 'El cliente aprueba 9 artículos y hace contraoferta solo en 1. Sin rechazar toda la cotización — tú aceptas, ajustas o contrapropones y la venta sigue activa.', icon: 'tag' },
    { label: '02', title: 'El historial que no miente', sub: 'Cada versión revisada genera un snapshot inmutable: v1, v2, v3. Si el cliente dice "yo aprobé otra cosa", tienes el registro exacto de quién, cuándo y qué aprobó.', icon: 'git_branch' },
    { label: '03', title: 'Sello criptográfico en cada acuerdo', sub: 'La versión aprobada se sella con SHA-256. Ni una coma puede modificarse sin romper la firma — seguridad de grado bancario en cada trato comercial.', icon: 'lock' },
    { label: '04', title: 'Negocia dentro de la cotización', sub: 'Mensajes y contraofertas integradas en el link público. El cliente escribe, tú respondes desde el detalle. Todo en el timeline — sin dispersión por WhatsApp.', icon: 'zap' },
  ],
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function ProductAccordion({ slug = 'editor' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const cardsRef   = useRef([]);
  const textsRef   = useRef([]);
  const iconsRef   = useRef([]);
  const sectionRef = useRef(null);

  const slides = SLIDES[slug] || SLIDES.editor;

  // Estado inicial cuando cambia el slug
  useEffect(() => {
    setActiveIndex(0);
    const cards = cardsRef.current.filter(Boolean);
    const texts = textsRef.current.filter(Boolean);
    const icons = iconsRef.current.filter(Boolean);
    if (!cards.length) return;
    gsap.set(cards, { flexGrow: (i) => i === 0 ? ACTIVE_GROW : RESTING[i] });
    gsap.set(texts, { opacity: (i) => i === 0 ? 1 : 0, y: (i) => i === 0 ? 0 : 16 });
    gsap.set(icons, {
      opacity: (i) => i === 0 ? 1 : 0.38,
      scale:   (i) => i === 0 ? 1 : 0.72,
    });
  }, [slug]);

  // Animación al cambiar el activo
  useEffect(() => {
    const cards = cardsRef.current.filter(Boolean);
    const texts = textsRef.current.filter(Boolean);
    const icons = iconsRef.current.filter(Boolean);
    if (!cards.length) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Ancho de tarjetas (flex-grow)
      cards.forEach((card, i) => {
        tl.to(card, {
          flexGrow: i === activeIndex ? ACTIVE_GROW : RESTING[i],
          duration: 0.90,
          ease: 'expo.out',
        }, 0);
      });

      // Texto: inactivo sale rápido, activo entra con delay
      texts.forEach((text, i) => {
        tl.to(text,
          i === activeIndex
            ? { opacity: 1, y: 0,  duration: 0.48, ease: 'power2.out' }
            : { opacity: 0, y: 16, duration: 0.18, ease: 'power2.in' },
          i === activeIndex ? 0.26 : 0
        );
      });

      // Iconos
      icons.forEach((icon, i) => {
        tl.to(icon, {
          opacity: i === activeIndex ? 1 : 0.38,
          scale:   i === activeIndex ? 1 : 0.72,
          duration: 0.55,
          ease: 'power2.out',
        }, 0);
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [activeIndex]);

  return (
    <section className="pac-section" ref={sectionRef}>
      <div className="pac-container">
        {slides.map((slide, i) => (
          <div
            key={i}
            ref={el => (cardsRef.current[i] = el)}
            className={`pac-card${i === activeIndex ? ' pac-active' : ''}`}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => setActiveIndex(i)}
            role="button"
            tabIndex={0}
            aria-label={slide.title}
            onKeyDown={e => e.key === 'Enter' && setActiveIndex(i)}
          >
            {/* Canvas WebGL a tamaño fijo — CSS lo estira sin reset */}
            <div className="pac-shader-wrap" aria-hidden="true">
              <CardShader palette={CARD_PALS[i]} />
            </div>

            {/* Rim light especular */}
            <div className="pac-rim" aria-hidden="true" />

            {/* Scrim — ligero en inactivas, opaco en activa */}
            <div className="pac-scrim" aria-hidden="true" />

            {/* Icono duotone Apple SF Symbols */}
            <div
              ref={el => (iconsRef.current[i] = el)}
              className="pac-icon"
              aria-hidden="true"
            >
              {ICONS[slide.icon]}
            </div>

            {/* Texto completo — solo visible en tarjeta activa */}
            <div
              ref={el => (textsRef.current[i] = el)}
              className="pac-text"
              aria-hidden={i !== activeIndex}
            >
              <span className="pac-eyebrow">{slide.label}</span>
              <h3 className="pac-title">{slide.title}</h3>
              <p className="pac-sub">{slide.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
