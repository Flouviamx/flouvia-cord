import { useEffect, useRef } from 'react';

// Motor idéntico al de BlogCover.jsx (FBM 5 octavas + domain-warp de 2 capas +
// tonemap Reinhard + dither) pero sin overlay de título/watermark — pensado
// para vivir como fondo reactivo dentro de una tarjeta (steps de "Cómo funciona").

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
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash2(i)            * 2.0 - 1.0, f);
  float b = dot(hash2(i+vec2(1,0))  * 2.0 - 1.0, f - vec2(1,0));
  float c = dot(hash2(i+vec2(0,1))  * 2.0 - 1.0, f - vec2(0,1));
  float d = dot(hash2(i+vec2(1,1))  * 2.0 - 1.0, f - vec2(1,1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p  = p * 2.13 + vec2(13.72, 5.29);
    a *= 0.46;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.y = 1.0 - uv.y;

  uv += u_mouse * 0.05;

  float t = u_time * 0.10;

  vec2 q = vec2(
    fbm(uv * 2.2 + t),
    fbm(uv * 2.2 + vec2(5.23, 1.31) + t * 0.82)
  );
  vec2 r = vec2(
    fbm(uv * 1.6 + q * 0.9 + vec2(1.71, 9.25) + t * 0.60),
    fbm(uv * 1.6 + q * 0.9 + vec2(8.31, 2.82) + t * 0.42)
  );

  float f = fbm(uv + r) * 0.5 + 0.5;

  float y = uv.y * 0.75 + fbm(uv * 2.8 + t * 0.28) * 0.32 + 0.08;
  y = clamp(y, 0.0, 1.0);

  vec3 col = mix(u_ca, u_cb, smoothstep(0.0, 0.55, y));
  col = mix(col, u_cc, smoothstep(0.40, 1.0, y + f * 0.22));

  col += (f - 0.5) * 0.055;

  float vig = 1.0 - length((uv - 0.5) * 1.5);
  vig = clamp(vig * vig, 0.0, 1.0);
  col *= vig * 0.30 + 0.58;

  float glow = exp(-length(uv - vec2(0.5, 0.42)) * 3.2) * 0.14;
  col += u_cc * glow;

  // Empuje de saturación — mantiene el azul denso en vez de lavarlo hacia gris/blanco
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.2);

  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.022;

  col  = col / (col + 0.34);
  col  = pow(clamp(col, 0.0, 1.0), vec3(0.88));

  // Empuje final hacia negro — navy oscuro y denso, no un azul brillante
  col *= 0.72;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Navy casi negro → azul marino denso → acento azul (nunca celeste pastel).
// Más oscuro que un azul "vivo" a propósito — se lee como el navy de marca
// de Cord (#0a192f), no como un azul brillante de landing genérica.
const PAL_BLUE = [
  [0.003, 0.008, 0.045],
  [0.012, 0.06, 0.32],
  [0.04, 0.16, 0.64],
];

function mkShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s); return s;
}
function mkProg(gl) {
  const p = gl.createProgram();
  gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER,   VERT));
  gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p); return p;
}

export default function StepShaderBg() {
  const canvasRef = useRef(null);
  const wrapRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr     = Math.min(window.devicePixelRatio || 1, 1.5);

    const gl = canvas.getContext('webgl', {
      antialias: false,
      powerPreference: 'low-power',
      alpha: false,
    });
    if (!gl) return;

    const prog = mkProg(gl);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(prog, 'u_res');
    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uCa    = gl.getUniformLocation(prog, 'u_ca');
    const uCb    = gl.getUniformLocation(prog, 'u_cb');
    const uCc    = gl.getUniformLocation(prog, 'u_cc');

    gl.uniform3fv(uCa, PAL_BLUE[0]);
    gl.uniform3fv(uCb, PAL_BLUE[1]);
    gl.uniform3fv(uCc, PAL_BLUE[2]);

    function resize() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      canvas.width  = Math.round(r.width  * dpr);
      canvas.height = Math.round(r.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    resize();

    const state = { running: false, raf: null, t: 0, mx: 0, my: 0, tx: 0, ty: 0 };

    function render(ts) {
      if (!state.running) return;
      state.t = reduced ? 0 : ts * 0.001;
      state.mx += (state.tx - state.mx) * 0.055;
      state.my += (state.ty - state.my) * 0.055;

      gl.uniform1f(uTime, state.t);
      gl.uniform2f(uMouse, state.mx, state.my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      state.raf = requestAnimationFrame(render);
    }

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        state.running = true;
        state.raf = requestAnimationFrame(render);
      } else {
        state.running = false;
        cancelAnimationFrame(state.raf);
      }
    }, { threshold: 0.05 });
    io.observe(canvas);

    function onMouseMove(e) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        state.tx = 0; state.ty = 0;
        return;
      }
      state.tx =  ((e.clientX - r.left) / r.width  * 2 - 1);
      state.ty = -((e.clientY - r.top)  / r.height * 2 - 1);
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    function onTouchMove(e) {
      const touch = e.touches[0];
      if (!touch) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      state.tx =  ((touch.clientX - r.left) / r.width  * 2 - 1) * 0.5;
      state.ty = -((touch.clientY - r.top)  / r.height * 2 - 1) * 0.5;
    }
    function onTouchEnd() { state.tx = 0; state.ty = 0; }
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend',  onTouchEnd,  { passive: true });

    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      state.running = false;
      cancelAnimationFrame(state.raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  onTouchEnd);
      try { gl.deleteProgram(prog); gl.deleteBuffer(buf); } catch (_) {}
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
