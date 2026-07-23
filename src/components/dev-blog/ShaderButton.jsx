import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_hover;
  uniform float u_active;
  uniform vec3 u_color;

  float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  void main() {
      // 4x4 pixel blocks
      float blockSize = 4.0;
      vec2 coord = floor(gl_FragCoord.xy / blockSize);
      
      float timeStep = floor(u_time * 20.0); // 20fps glitch updates
      float noise = random(coord);
      float glitchNoise = random(coord + timeStep);

      // Determine if we are near the edge
      bool isEdge = gl_FragCoord.x < blockSize || gl_FragCoord.x > u_resolution.x - blockSize ||
                    gl_FragCoord.y < blockSize || gl_FragCoord.y > u_resolution.y - blockSize;
                    
      // Jagged edge effect (always missing some edge pixels)
      if (isEdge && noise > 0.90) {
          discard;
      }

      // Base colors
      // u_color is passed as RGB (e.g. 16, 185, 129 for green)
      vec3 color = u_active > 0.5 ? (u_color / 255.0) : vec3(1.0, 1.0, 1.0);
      float alpha = u_active > 0.5 ? 1.0 : 0.03;

      // Hover glitch effect using GSAP interpolated u_hover
      if (u_hover > 0.0) {
          // 15% chance to glitch a pixel
          if (glitchNoise > 0.85) {
              // Interpolate the glitch intensity based on u_hover
              alpha = mix(alpha, u_active > 0.5 ? 0.0 : 0.4, u_hover);
          }
      }

      // Pre-multiply alpha
      gl_FragColor = vec4(color * alpha, alpha);
  }
`;

// Helper to compile shaders
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function ShaderButton({ children, href, active, color = [16, 185, 129] }) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const hoverVal = useRef({ value: 0 }); // GSAP target

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use webgl context
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Full screen quad
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uHover = gl.getUniformLocation(program, "u_hover");
    const uActive = gl.getUniformLocation(program, "u_active");
    const uColor = gl.getUniformLocation(program, "u_color");

    let startTime = performance.now();

    const resize = () => {
      // Match canvas internal resolution to CSS size
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };
    
    // Initial resize and observer for dynamic resizing
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    gl.uniform1f(uActive, active ? 1.0 : 0.0);
    gl.uniform3f(uColor, color[0], color[1], color[2]);

    const render = (time) => {
      gl.uniform1f(uTime, (time - startTime) / 1000.0);
      gl.uniform1f(uHover, hoverVal.current.value);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(requestRef.current);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
    };
  }, [active, color]);

  const handleMouseEnter = () => {
    gsap.to(hoverVal.current, { value: 1, duration: 0.2, ease: 'power2.out' });
  };
  const handleMouseLeave = () => {
    gsap.to(hoverVal.current, { value: 0, duration: 0.3, ease: 'power2.in' });
  };

  return (
    <a 
      href={href} 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        textDecoration: 'none',
        color: active ? '#0a192f' : '#94a3b8',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      <canvas 
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
          borderRadius: '1px'
        }}
      />
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </a>
  );
}
