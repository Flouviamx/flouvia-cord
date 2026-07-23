import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

// A 7x19 matrix representing the word "BLOG"
const matrix = [
  [1,1,1,0, 0, 1,0,0,0, 0, 0,1,1,0, 0, 0,1,1,1],
  [1,0,0,1, 0, 1,0,0,0, 0, 1,0,0,1, 0, 1,0,0,0],
  [1,0,0,1, 0, 1,0,0,0, 0, 1,0,0,1, 0, 1,0,0,0],
  [1,1,1,0, 0, 1,0,0,0, 0, 1,0,0,1, 0, 1,0,1,1],
  [1,0,0,1, 0, 1,0,0,0, 0, 1,0,0,1, 0, 1,0,0,1],
  [1,0,0,1, 0, 1,0,0,0, 0, 1,0,0,1, 0, 1,0,0,1],
  [1,1,1,0, 0, 1,1,1,1, 0, 0,1,1,0, 0, 0,1,1,0]
];

export default function PixelBlog() {
  const containerRef = useRef(null);
  const blocksRef = useRef([]);
  const dragState = useRef({ block: null, startX: 0, startY: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, time: 0, baseX: 0, baseY: 0 });

  const getInitialColor = (r, c) => {
    const greens = ['#10b981', '#059669', '#34d399'];
    return greens[(r * 13 + c * 7) % 3];
  };

  const getHoverColor = (r, c) => {
    // Solo tonos de azul distintos (sin usar el azul del fondo ni blancos)
    const customBlues = ['#2563eb', '#0ea5e9', '#0284c7'];
    return customBlues[(r * 7 + c * 13) % 3];
  };

  // 1. ANIMACIÓN DE ENTRADA
  useEffect(() => {
    const blocks = blocksRef.current.filter(Boolean);
    gsap.fromTo(blocks, 
      { z: () => gsap.utils.random(100, 400), y: () => gsap.utils.random(-100, 100), x: () => gsap.utils.random(-100, 100), rotationX: () => gsap.utils.random(-180, 180), rotationY: () => gsap.utils.random(-180, 180), scale: 0.2, opacity: 0 },
      { z: 0, y: 0, x: 0, rotationX: 0, rotationY: 0, scale: 1, opacity: 1, duration: 1.2, stagger: { amount: 0.7, grid: "auto", from: "center" }, ease: "power4.out" }
    );
  }, []);

  // 2. LÓGICA DEL EASTER EGG (DRAG & THROW)
  useEffect(() => {
    const onPointerMove = (e) => {
      const state = dragState.current;
      if (!state.block) return;
      
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      
      // Mover el bloque libremente
      gsap.set(state.block, { x: state.baseX + dx, y: state.baseY + dy });
      
      // Calcular velocidad (px/ms)
      const now = performance.now();
      const dt = Math.max(1, now - state.time);
      state.vx = (e.clientX - state.lastX) / dt;
      state.vy = (e.clientY - state.lastY) / dt;
      
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.time = now;
    };

    const onPointerUp = (e) => {
      const state = dragState.current;
      if (!state.block) return;
      
      const block = state.block;
      state.block = null;
      block.style.cursor = "grab";
      
      // Convertir a px/s
      let vx = state.vx * 1000;
      let vy = state.vy * 1000;
      
      // Si el usuario soltó el bloque sin moverlo (clic rápido), darle un pequeño "toss" juguetón
      if (Math.abs(vx) < 50 && Math.abs(vy) < 50) {
         vy = -300;
         vx = (Math.random() - 0.5) * 400;
      }
      
      vx = Math.max(-2000, Math.min(2000, vx));
      vy = Math.max(-2000, Math.min(2000, vy));

      // Animación de físicas: gravedad y giro
      gsap.to(block, {
        x: `+=${vx}`,
        y: `+=${vy + 1500}`, // Caída al vacío (gravedad)
        rotationZ: vx * 0.5,
        rotationX: 360 * Math.sign(vy || 1),
        rotationY: vx * 0.2,
        duration: 1.5,
        ease: "power2.in", 
        onComplete: () => {
          // Reset oculto y delay antes de reaparecer
          gsap.to(block, {
            x: 0, y: 0, z: 0, rotationZ: 0, rotationX: 0, rotationY: 0, scale: 0, opacity: 0, duration: 0, delay: 1.5,
            onComplete: () => {
               block.dataset.dragging = "false";
               block.parentNode.style.zIndex = 1;
               
               // Reaparecer ("Respawn") estilo 3D elástico
               gsap.to(block, { 
                 scale: 1, opacity: 1, duration: 0.8, 
                 ease: "elastic.out(1, 0.4)", 
                 backgroundColor: block.dataset.origColor,
                 borderRadius: '0%',
                 boxShadow: 'none'
               });
            }
          });
        }
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handlePointerDown = (e, index) => {
    e.preventDefault();
    const block = blocksRef.current[index];
    if(!block) return;
    
    block.dataset.dragging = "true";
    block.style.cursor = "grabbing";
    
    // Traer al frente para que no colisione visualmente con los demás
    block.parentNode.style.zIndex = 100;
    block.style.position = "relative";
    
    dragState.current = {
      block,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      vx: 0,
      vy: 0,
      time: performance.now(),
      baseX: gsap.getProperty(block, "x") || 0,
      baseY: gsap.getProperty(block, "y") || 0
    };

    // Matar animaciones previas (hover/entrada) y prepararlo para ser arrastrado como bloque 3D
    gsap.killTweensOf(block);
    gsap.to(block, { 
      scale: 1.8, 
      z: 150, 
      borderRadius: '0%', // Se mantiene como píxel cuadrado
      boxShadow: '4px 8px 16px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)', // Sombra para volumen 3D
      duration: 0.2, 
      ease: "power2.out" 
    });
  };

  // 3. LÓGICA DE HOVER
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const { clientX, clientY } = e;
    
    blocksRef.current.forEach((block) => {
      if (!block || block.dataset.dragging === "true") return; // Ignorar el bloque que estamos arrastrando
      
      const rect = block.getBoundingClientRect();
      const bx = rect.left + rect.width / 2;
      const by = rect.top + rect.height / 2;
      const dist = Math.hypot(clientX - bx, clientY - by);
      
      if (dist < 70) {
        const intensity = 1 - (dist / 70);
        gsap.to(block, {
          backgroundColor: block.dataset.hoverColor,
          scale: 1 + (0.25 * intensity),
          z: 30 * intensity,
          rotationX: (clientY - by) * 0.4 * intensity,
          rotationY: (bx - clientX) * 0.4 * intensity,
          borderRadius: `${30 * intensity}%`,
          duration: 0.15,
          ease: "power2.out",
          overwrite: "auto"
        });
      } else {
        gsap.to(block, {
          backgroundColor: block.dataset.origColor,
          scale: 1, z: 0, rotationX: 0, rotationY: 0, borderRadius: '0%', duration: 0.8, ease: "elastic.out(1, 0.5)", overwrite: "auto"
        });
      }
    });
  };

  const handleMouseLeave = () => {
    blocksRef.current.forEach(block => {
      if (block && block.dataset.dragging !== "true") {
        gsap.to(block, {
          backgroundColor: block.dataset.origColor,
          scale: 1, z: 0, rotationX: 0, rotationY: 0, borderRadius: '0%', duration: 0.8, ease: "elastic.out(1, 0.5)", overwrite: "auto"
        });
      }
    });
  };

  let blockIndex = 0;

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(19, 1fr)`,
        gap: '1px',
        padding: '32px 32px 32px 0',
        perspective: '1200px'
      }}
    >
      {matrix.map((row, rIdx) => 
        row.map((val, cIdx) => {
          if (val === 1) {
            const currentIndex = blockIndex++;
            const color = getInitialColor(rIdx, cIdx);
            const hoverColor = getHoverColor(rIdx, cIdx);
            return (
              <div key={`${rIdx}-${cIdx}`} style={{ width: '14px', height: '14px' }}>
                <div 
                  ref={el => blocksRef.current[currentIndex] = el}
                  data-orig-color={color}
                  data-hover-color={hoverColor}
                  onPointerDown={(e) => handlePointerDown(e, currentIndex)}
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: color,
                    borderRadius: '0',
                    transformOrigin: 'center center',
                    cursor: 'grab',
                    touchAction: 'none' // Evita scroll en móvil al arrastrar
                  }}
                />
              </div>
            );
          }
          return <div key={`${rIdx}-${cIdx}`} style={{ width: '14px', height: '14px' }} />;
        })
      )}
    </div>
  );
}
