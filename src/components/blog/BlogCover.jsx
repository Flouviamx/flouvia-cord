import { useEffect, useRef } from 'react';

// ─── Shaders ──────────────────────────────────────────────────────────────────

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
uniform float u_featured;

// ── Gradient noise (smooth value noise) ──
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

  // Mouse parallax — subtle UV shift (wider on featured hero)
  float parallax = u_featured > 0.5 ? 0.06 : 0.04;
  uv += u_mouse * parallax;

  float t = u_time * 0.10;

  // Domain warp — two layers of FBM
  vec2 q = vec2(
    fbm(uv * 2.2 + t),
    fbm(uv * 2.2 + vec2(5.23, 1.31) + t * 0.82)
  );
  vec2 r = vec2(
    fbm(uv * 1.6 + q * 0.9 + vec2(1.71, 9.25) + t * 0.60),
    fbm(uv * 1.6 + q * 0.9 + vec2(8.31, 2.82) + t * 0.42)
  );

  float f = fbm(uv + r) * 0.5 + 0.5;

  // Warped vertical coordinate drives the gradient
  float y = uv.y * 0.75 + fbm(uv * 2.8 + t * 0.28) * 0.32 + 0.08;
  y = clamp(y, 0.0, 1.0);

  // Three-stop gradient
  vec3 col = mix(u_ca, u_cb, smoothstep(0.0, 0.55, y));
  col = mix(col, u_cc, smoothstep(0.40, 1.0, y + f * 0.22));

  // FBM brightness micro-variation
  col += (f - 0.5) * 0.055;

  // Vignette (darker edges — photo feel)
  float vig = 1.0 - length((uv - 0.5) * 1.5);
  vig = clamp(vig * vig, 0.0, 1.0);
  col *= vig * 0.28 + 0.72;

  // Subtle center glow (ElevenLabs warmth)
  float glow = exp(-length(uv - vec2(0.5, 0.4)) * 3.5) * 0.09;
  col += u_cc * glow;

  // Film grain / dither (removes color banding)
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.024;

  // Reinhard tonemap
  col  = col / (col + 0.35);
  col  = pow(clamp(col, 0.0, 1.0), vec3(0.90));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Category watermark icons (SVG paths, rendered at ghost opacity) ─────────

const ICONS = {
  'Finanzas':    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  'Finance':     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  'Ventas B2B':  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  'B2B Sales':   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  'Fiscal':      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
  'Tecnología':  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  'Technology':  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  'Operaciones': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="16" y="13" width="6" height="8" rx="1"/></svg>,
  'Operations':  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="16" y="13" width="6" height="8" rx="1"/></svg>,
  'featured':    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
};

// ─── Palettes (dark → mid → highlight) ───────────────────────────────────────

const PAL = {
  // Finanzas — deep navy → blue → electric azure
  'Finanzas':    [[0.04,0.10,0.25],[0.09,0.26,0.52],[0.23,0.51,0.96]],
  'Finance':     [[0.04,0.10,0.25],[0.09,0.26,0.52],[0.23,0.51,0.96]],
  // Ventas B2B — dark teal → ocean → cyan
  'Ventas B2B':  [[0.03,0.13,0.24],[0.04,0.39,0.55],[0.02,0.72,0.85]],
  'B2B Sales':   [[0.03,0.13,0.24],[0.04,0.39,0.55],[0.02,0.72,0.85]],
  // Fiscal — forest → emerald → mint
  'Fiscal':      [[0.03,0.16,0.11],[0.06,0.36,0.22],[0.05,0.71,0.50]],
  // Tecnología — very dark purple → violet → lavender
  'Tecnología':  [[0.09,0.03,0.22],[0.29,0.10,0.57],[0.55,0.36,0.98]],
  'Technology':  [[0.09,0.03,0.22],[0.29,0.10,0.57],[0.55,0.36,0.98]],
  // Operaciones — dark warm → orange → gold
  'Operaciones': [[0.16,0.05,0.00],[0.47,0.17,0.06],[0.97,0.44,0.08]],
  'Operations':  [[0.16,0.05,0.00],[0.47,0.17,0.06],[0.97,0.44,0.08]],
  // featured — extra premium blue
  'featured':    [[0.03,0.08,0.21],[0.11,0.27,0.55],[0.37,0.61,0.99]],
};
const DEFAULT_PAL = [[0.06,0.09,0.15],[0.11,0.22,0.37],[0.38,0.65,0.98]];

// ─── WebGL helpers ────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function BlogCover({ category = 'default', featured = false, title = '' }) {
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

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uRes      = gl.getUniformLocation(prog, 'u_res');
    const uTime     = gl.getUniformLocation(prog, 'u_time');
    const uMouse    = gl.getUniformLocation(prog, 'u_mouse');
    const uCa       = gl.getUniformLocation(prog, 'u_ca');
    const uCb       = gl.getUniformLocation(prog, 'u_cb');
    const uCc       = gl.getUniformLocation(prog, 'u_cc');
    const uFeatured = gl.getUniformLocation(prog, 'u_featured');

    const pal = PAL[category] || DEFAULT_PAL;
    gl.uniform3fv(uCa, pal[0]);
    gl.uniform3fv(uCb, pal[1]);
    gl.uniform3fv(uCc, pal[2]);
    gl.uniform1f(uFeatured, featured ? 1.0 : 0.0);

    // Resize helper
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

    // Mutable state (avoids stale closures)
    const state = { running: false, raf: null, t: 0, mx: 0, my: 0, tx: 0, ty: 0 };

    function render(ts) {
      if (!state.running) return;
      state.t = reduced ? 0 : ts * 0.001;
      // Lerp mouse toward target
      state.mx += (state.tx - state.mx) * 0.055;
      state.my += (state.ty - state.my) * 0.055;

      gl.uniform1f(uTime, state.t);
      gl.uniform2f(uMouse, state.mx, state.my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      state.raf = requestAnimationFrame(render);
    }

    // IntersectionObserver — pause when off-screen
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

    // Mouse — window-level tracking, rect-relative coords (same pattern as project shaders)
    function onMouseMove(e) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        // Mouse left this card's area
        state.tx = 0; state.ty = 0;
        return;
      }
      state.tx =  ((e.clientX - r.left) / r.width  * 2 - 1);
      state.ty = -((e.clientY - r.top)  / r.height * 2 - 1);
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Touch (mobile scroll interaction)
    function onTouchMove(e) {
      const touch = e.touches[0];
      if (!touch) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      // Gentler effect on touch
      state.tx =  ((touch.clientX - r.left) / r.width  * 2 - 1) * 0.5;
      state.ty = -((touch.clientY - r.top)  / r.height * 2 - 1) * 0.5;
    }
    function onTouchEnd() { state.tx = 0; state.ty = 0; }
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend',  onTouchEnd,  { passive: true });

    // Device orientation (gyroscope on mobile)
    function onOrient(e) {
      if (e.beta === null || e.gamma === null) return;
      const gamma = Math.max(-40, Math.min(40, e.gamma || 0));
      const beta  = Math.max(-40, Math.min(40, (e.beta  || 45) - 45));
      state.tx =  gamma / 40;
      state.ty = -beta  / 40;
    }
    window.addEventListener('deviceorientation', onOrient, { passive: true });

    // ResizeObserver
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      state.running = false;
      cancelAnimationFrame(state.raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('mousemove',        onMouseMove);
      window.removeEventListener('touchmove',        onTouchMove);
      window.removeEventListener('touchend',         onTouchEnd);
      window.removeEventListener('deviceorientation', onOrient);
      try { gl.deleteProgram(prog); gl.deleteBuffer(buf); } catch (_) {}
    };
  }, [category, featured]);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      {/* Category watermark — ghost icon, barely-there at subpixel opacity */}
      {(ICONS[category] || ICONS['featured']) && (
        <div style={{
          position: 'absolute',
          top: featured ? '1.4rem' : '0.9rem',
          right: featured ? '1.6rem' : '0.9rem',
          width: featured ? '140px' : '90px',
          height: featured ? '140px' : '90px',
          opacity: 0.09,
          color: '#ffffff',
          pointerEvents: 'none',
          zIndex: 2,
        }}>
          {ICONS[category] || ICONS['featured']}
        </div>
      )}

      {/* Title overlay */}
      {title && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          padding: featured ? '2rem 2.2rem' : '1.2rem 1.25rem 1.25rem',
          background: featured
            ? 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.22) 50%, transparent 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)',
          userSelect: 'none',
        }}>
          <p style={{
            margin: 0,
            color: 'rgba(255,255,255,0.97)',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 700,
            fontSize: featured ? 'clamp(1.6rem, 2.8vw, 2.4rem)' : 'clamp(0.88rem, 1.4vw, 1.05rem)',
            lineHeight: featured ? 1.15 : 1.3,
            letterSpacing: featured ? '-0.034em' : '-0.016em',
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            textAlign: 'left',
            maxWidth: featured ? '80%' : '100%',
            display: '-webkit-box',
            WebkitLineClamp: featured ? 3 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
