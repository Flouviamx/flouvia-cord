import { useEffect, useRef } from 'react';

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
  
  // Adjusted for a lighter, softer feel
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;
  
  // Parallax based on mouse
  p += u_mouse * 0.15;
  
  float t = u_time * 0.4;
  
  // Domain warping for fluid look
  vec2 q = vec2(fbm(p + t * 0.3), fbm(p + vec2(4.3, 1.7) - t * 0.2));
  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.2, 5.4) + t * 0.1), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.15));
  
  float n = fbm(p + 3.0 * r + t * 0.2);
  
  // Mix colors based on noise
  vec3 col = mix(u_ca, u_cb, clamp(n * 1.5, 0.0, 1.0));
  col = mix(col, u_cc, clamp(length(q) * 0.8, 0.0, 1.0));
  
  // Add a soft glow based on mouse proximity
  float dist = length(uv - (u_mouse * 0.5 + 0.5));
  col += u_cc * smoothstep(0.8, 0.0, dist) * 0.3;
  
  gl_FragColor = vec4(col, 1.0);
}
`;

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

export default function HelpAiShader() {
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

    // Azul Claro palette (Sky/Cyan/Blue)
    // Darker base to contrast with white text, but definitely blue/cyan
    gl.uniform3fv(uCa, [0.03, 0.5, 0.8]); // Base blue
    gl.uniform3fv(uCb, [0.1, 0.7, 0.9]); // Cyan
    gl.uniform3fv(uCc, [0.3, 0.9, 1.0]); // Light cyan

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

    const state = { running: true, raf: null, t: 0, mx: 0, my: 0, tx: 0, ty: 0 };

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
    state.raf = requestAnimationFrame(render);

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

    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      state.running = false;
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      try { gl.deleteProgram(prog); gl.deleteBuffer(buf); } catch (_) {}
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
