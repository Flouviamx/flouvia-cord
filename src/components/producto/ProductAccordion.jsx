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
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3 L18.4 11.6 L27 14 L18.4 16.4 L16 25 L13.6 16.4 L5 14 L13.6 11.6 Z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M16 3 L18.4 11.6 L27 14 L18.4 16.4 L16 25 L13.6 16.4 L5 14 L13.6 11.6 Z" />
      <path d="M16 8 L17.2 12.8 L22 14 L17.2 15.2 L16 20 L14.8 15.2 L10 14 L14.8 12.8 Z" fill="currentColor" fillOpacity="0.4"/>
      <path d="M25 4 L25.8 6.2 L28 7 L25.8 7.8 L25 10 L24.2 7.8 L22 7 L24.2 6.2 Z" fill="currentColor" fillOpacity="0.6" stroke="none"/>
      <path d="M7 23 L7.6 24.6 L9.2 25.2 L7.6 25.8 L7 27.4 L6.4 25.8 L4.8 25.2 L6.4 24.6 Z" fill="currentColor" fillOpacity="0.4" stroke="none"/>
      <circle cx="16" cy="14" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5 H14 L27.5 18.5 C28.3 19.3 28.3 20.6 27.5 21.4 L21.4 27.5 C20.6 28.3 19.3 28.3 18.5 27.5 L5 14 V5 Z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M5 5 H14 L27.5 18.5 C28.3 19.3 28.3 20.6 27.5 21.4 L21.4 27.5 C20.6 28.3 19.3 28.3 18.5 27.5 L5 14 V5 Z" />
      <circle cx="10.5" cy="10.5" r="2.5" fill="currentColor" fillOpacity="0.3"/>
      <line x1="16" y1="14" x2="22" y2="20" strokeWidth="2" strokeOpacity="0.8"/>
      <line x1="13" y1="17" x2="19" y2="23" strokeWidth="2" strokeOpacity="0.4"/>
      <path d="M7 8 H10.5" strokeWidth="1.5" strokeOpacity="0.3"/>
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="16,13 28,7 16,1 4,7" fill="currentColor" fillOpacity="0.25"/>
      <polygon points="16,13 28,7 16,1 4,7" />
      <polyline points="4,13 16,19 28,13" fill="currentColor" fillOpacity="0.15"/>
      <polyline points="4,13 16,19 28,13" />
      <polyline points="4,19 16,25 28,19" fill="currentColor" fillOpacity="0.08"/>
      <polyline points="4,19 16,25 28,19" />
      <line x1="16" y1="13" x2="16" y2="25" strokeOpacity="0.4" strokeDasharray="2 2"/>
      <circle cx="16" cy="7" r="2" fill="currentColor" fillOpacity="0.8" stroke="none"/>
    </svg>
  ),
  calculator: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="24" height="28" rx="5" fill="currentColor" fillOpacity="0.12"/>
      <rect x="4" y="2" width="24" height="28" rx="5"/>
      <rect x="8" y="6" width="16" height="7" rx="2" fill="currentColor" fillOpacity="0.25"/>
      <path d="M10 10 H22" strokeOpacity="0.5"/>
      <circle cx="10" cy="17" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="17" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="22" cy="17" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="23" r="1.5" fill="currentColor" stroke="none" fillOpacity="0.5"/>
      <circle cx="16" cy="23" r="1.5" fill="currentColor" stroke="none" fillOpacity="0.5"/>
      <rect x="20.5" y="21.5" width="3" height="3" rx="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  check_circle: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="14" fill="currentColor" fillOpacity="0.12"/>
      <circle cx="16" cy="16" r="14"/>
      <circle cx="16" cy="16" r="10" fill="currentColor" fillOpacity="0.15"/>
      <polyline points="10,16.5 14,20.5 22,11.5" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16 C6 7 11 4 16 4 C21 4 26 7 30 16 C26 25 21 28 16 28 C11 28 6 25 2 16 Z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M2 16 C6 7 11 4 16 4 C21 4 26 7 30 16 C26 25 21 28 16 28 C11 28 6 25 2 16 Z"/>
      <circle cx="16" cy="16" r="6" fill="currentColor" fillOpacity="0.25"/>
      <circle cx="16" cy="16" r="6"/>
      <circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="14" r="1" fill="currentColor" fillOpacity="0.8" stroke="none"/>
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3 V29 L9.5 26 L13 29 L16.5 26 L20 29 L23.5 26 L27 29 V3 Z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M6 3 V29 L9.5 26 L13 29 L16.5 26 L20 29 L23.5 26 L27 29 V3 Z"/>
      <line x1="11" y1="10" x2="22" y2="10" strokeWidth="2"/>
      <line x1="11" y1="15" x2="19" y2="15" strokeWidth="1.5" strokeOpacity="0.6"/>
      <line x1="11" y1="20" x2="22" y2="20" strokeWidth="1.5" strokeOpacity="0.3"/>
      <circle cx="20" cy="15" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="10" r="5" fill="currentColor" fillOpacity="0.2"/>
      <circle cx="13" cy="10" r="5"/>
      <path d="M4 27 V24 A7 7 0 0 1 18 24 V27" fill="currentColor" fillOpacity="0.12"/>
      <path d="M4 27 V24 A7 7 0 0 1 18 24 V27"/>
      <circle cx="23" cy="12" r="3.5" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="23" cy="12" r="3.5" strokeOpacity="0.7"/>
      <path d="M22 27 V25 A5 5 0 0 1 27 20 H28" strokeOpacity="0.7"/>
      <circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none" fillOpacity="0.5"/>
    </svg>
  ),
  robot: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="24" height="18" rx="4" fill="currentColor" fillOpacity="0.15"/>
      <rect x="4" y="10" width="24" height="18" rx="4"/>
      <rect x="11" y="2" width="10" height="8" rx="2" fill="currentColor" fillOpacity="0.25"/>
      <rect x="11" y="2" width="10" height="8" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="0"/>
      <rect x="10" y="16" width="4" height="4" rx="2" fill="currentColor" stroke="none"/>
      <rect x="18" y="16" width="4" height="4" rx="2" fill="currentColor" stroke="none"/>
      <path d="M12 24 H20" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  currency: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="14" fill="currentColor" fillOpacity="0.12"/>
      <circle cx="16" cy="16" r="14"/>
      <path d="M21 11 H13 A3.5 3.5 0 0 0 13 18 H19 A3.5 3.5 0 0 1 19 25 H11" strokeWidth="2"/>
      <line x1="16" y1="6" x2="16" y2="11" strokeWidth="2"/>
      <line x1="16" y1="25" x2="16" y2="30" strokeWidth="2"/>
      <circle cx="16" cy="16" r="9" strokeOpacity="0.15" strokeWidth="1"/>
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="18" width="6" height="12" rx="1.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="13" y="10" width="6" height="20" rx="1.5" fill="currentColor" fillOpacity="0.25"/>
      <rect x="22" y="2" width="6" height="28" rx="1.5" fill="currentColor" fillOpacity="0.4"/>
      <rect x="4" y="18" width="6" height="12" rx="1.5"/>
      <rect x="13" y="10" width="6" height="20" rx="1.5"/>
      <rect x="22" y="2" width="6" height="28" rx="1.5"/>
      <path d="M7 14 L16 6 L25 -2" strokeWidth="2" strokeOpacity="0.6"/>
      <circle cx="25" cy="2" r="2.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 2 L28 7 V15 C28 23 16 29 16 29 C16 29 4 23 4 15 V7 Z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M16 2 L28 7 V15 C28 23 16 29 16 29 C16 29 4 23 4 15 V7 Z"/>
      <path d="M16 8 L22 10.5 V15 C22 19 16 22 16 22 C16 22 10 19 10 15 V10.5 Z" fill="currentColor" fillOpacity="0.25"/>
      <polyline points="12,15 15,18 20,12" strokeWidth="2"/>
    </svg>
  ),
  git_branch: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="7" r="4" fill="currentColor" fillOpacity="0.25"/>
      <circle cx="8" cy="7" r="4"/>
      <circle cx="24" cy="7" r="4" fill="currentColor" fillOpacity="0.25"/>
      <circle cx="24" cy="7" r="4"/>
      <circle cx="8" cy="25" r="4" fill="currentColor" fillOpacity="0.25"/>
      <circle cx="8" cy="25" r="4"/>
      <line x1="8" y1="11" x2="8" y2="21"/>
      <path d="M24 11 C24 18 15 21 8 23" strokeWidth="1.75"/>
      <line x1="12" y1="7" x2="20" y2="7" strokeOpacity="0.4" strokeDasharray="2 2"/>
      <circle cx="16" cy="19" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="14" fill="currentColor" fillOpacity="0.12"/>
      <circle cx="16" cy="16" r="14"/>
      <ellipse cx="16" cy="16" rx="6" ry="14" fill="currentColor" fillOpacity="0.1"/>
      <ellipse cx="16" cy="16" rx="6" ry="14"/>
      <line x1="2" y1="16" x2="30" y2="16" strokeOpacity="0.5"/>
      <path d="M4 10 Q16 12 28 10" strokeOpacity="0.4"/>
      <path d="M4 22 Q16 20 28 22" strokeOpacity="0.4"/>
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="13" width="22" height="16" rx="4" fill="currentColor" fillOpacity="0.15"/>
      <rect x="5" y="13" width="22" height="16" rx="4"/>
      <path d="M9 13 V9 A7 7 0 0 1 23 9 V13" strokeWidth="2"/>
      <circle cx="16" cy="21" r="3" fill="currentColor" fillOpacity="0.4"/>
      <line x1="16" y1="21" x2="16" y2="25" strokeWidth="2"/>
    </svg>
  ),
  trending: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,26 12,15 18,21 29,8 22,8" fill="currentColor" fillOpacity="0.15"/>
      <path d="M3 26 L12 15 L18 21 L29 8" strokeWidth="2"/>
      <polyline points="21,8 29,8 29,16" strokeWidth="2"/>
      <circle cx="29" cy="8" r="2.5" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="21" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M26 12 A10 10 0 0 0 6 12 C6 21 2 25 2 25 H30 C30 25 26 21 26 12 Z" fill="currentColor" fillOpacity="0.15"/>
      <path d="M26 12 A10 10 0 0 0 6 12 C6 21 2 25 2 25 H30 C30 25 26 21 26 12 Z"/>
      <path d="M12 25 A4 4 0 0 0 20 25"/>
      <circle cx="25" cy="7" r="4" fill="currentColor" stroke="none"/>
      <circle cx="25" cy="7" r="2" fill="#ffffff" stroke="none"/>
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="18,2 4,18 15,18 14,30 28,14 17,14" fill="currentColor" fillOpacity="0.25"/>
      <polygon points="18,2 4,18 15,18 14,30 28,14 17,14"/>
      <circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="none"/>
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
  const vlabelsRef = useRef([]);
  const sectionRef = useRef(null);
  function handleClick(i) {
    if (i !== activeIndex) {
      setActiveIndex(i);
    }
  }

  const slides = SLIDES[slug] || SLIDES.editor;

  // Estado inicial cuando cambia el slug
  useEffect(() => {
    setActiveIndex(0);
    const cards   = cardsRef.current.filter(Boolean);
    const texts   = textsRef.current.filter(Boolean);
    const icons   = iconsRef.current.filter(Boolean);
    const vlabels = vlabelsRef.current.filter(Boolean);
    if (!cards.length) return;
    gsap.set(cards, { flexGrow: (i) => i === 0 ? ACTIVE_GROW : RESTING[i] });
    gsap.set(texts, { opacity: (i) => i === 0 ? 1 : 0, y: (i) => i === 0 ? 0 : 15 });
    gsap.set(icons, {
      opacity: (i) => i === 0 ? 1 : 0.4,
      scale:   (i) => i === 0 ? 1 : 0.7,
      y:       (i) => i === 0 ? 0 : 8,
    });
    gsap.set(vlabels, { opacity: (i) => i === 0 ? 0 : 0.9 });
  }, [slug]);

  // Animación al cambiar el activo
  useEffect(() => {
    const cards   = cardsRef.current.filter(Boolean);
    const texts   = textsRef.current.filter(Boolean);
    const icons   = iconsRef.current.filter(Boolean);
    const vlabels = vlabelsRef.current.filter(Boolean);
    if (!cards.length) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Ancho de tarjetas (flex-grow)
      cards.forEach((card, i) => {
        tl.to(card, {
          flexGrow: i === activeIndex ? ACTIVE_GROW : RESTING[i],
          duration: 0.85,
          ease: 'power4.out',
        }, 0);
      });

      // Texto: inactivo sale rápido, activo entra con delay
      texts.forEach((text, i) => {
        tl.to(text, {
          opacity: i === activeIndex ? 1 : 0,
          y: i === activeIndex ? 0 : 15,
          duration: i === activeIndex ? 0.6 : 0.25,
          ease: i === activeIndex ? 'power3.out' : 'power2.inOut',
        }, i === activeIndex ? 0.2 : 0);
      });

      // Iconos
      icons.forEach((icon, i) => {
        tl.to(icon, {
          opacity: i === activeIndex ? 1 : 0.4,
          scale:   i === activeIndex ? 1 : 0.7,
          y:       i === activeIndex ? 0 : 8,
          duration: 0.8,
          ease: 'power4.out',
        }, 0);
      });

      // Etiquetas verticales "01 / 02 / 03 / 04" — solo en inactivas
      vlabels.forEach((label, i) => {
        tl.to(label, {
          opacity: i === activeIndex ? 0 : 0.9,
          duration: i === activeIndex ? 0.2 : 0.6,
          ease: 'power3.out',
        }, i === activeIndex ? 0 : 0.2);
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
            onClick={() => handleClick(i)}
            role="button"
            tabIndex={0}
            aria-label={slide.title}
            onKeyDown={e => e.key === 'Enter' && handleClick(i)}
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

            {/* Etiqueta vertical — visible solo en tarjetas inactivas */}
            <div
              ref={el => (vlabelsRef.current[i] = el)}
              className="pac-vlabel"
              aria-hidden="true"
            >
              <span className="pac-vlabel-num">{slide.label}</span>
              <span className="pac-vlabel-sep">·</span>
              <span className="pac-vlabel-txt">{slide.title}</span>
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
