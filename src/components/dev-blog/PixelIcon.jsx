import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function PixelIcon({ 
  matrix, 
  pixelSize = 4, 
  gap = 1,
  baseColor = '#10b981', 
  hoverColors = ['#2563eb', '#0ea5e9', '#0284c7']
}) {
  const containerRef = useRef(null);
  const blocksRef = useRef([]);
  const dragState = useRef({ block: null, startX: 0, startY: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, time: 0, baseX: 0, baseY: 0 });

  const rows = matrix.length;
  const cols = matrix[0].length;

  const getHoverColor = (r, c) => {
    return hoverColors[(r * 7 + c * 13) % hoverColors.length];
  };

  // 1. ANIMACIÓN DE ENTRADA
  useEffect(() => {
    const blocks = blocksRef.current.filter(Boolean);
    gsap.fromTo(blocks, 
      { z: () => gsap.utils.random(50, 150), y: () => gsap.utils.random(-30, 30), x: () => gsap.utils.random(-30, 30), rotationX: () => gsap.utils.random(-180, 180), rotationY: () => gsap.utils.random(-180, 180), scale: 0.2, opacity: 0 },
      { z: 0, y: 0, x: 0, rotationX: 0, rotationY: 0, scale: 1, opacity: 1, duration: 1.0, stagger: { amount: 0.4, grid: "auto", from: "center" }, ease: "power4.out" }
    );
  }, [matrix]);

  // 2. LÓGICA DEL EASTER EGG (DRAG & THROW)
  useEffect(() => {
    const onPointerMove = (e) => {
      const state = dragState.current;
      if (!state.block) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      gsap.set(state.block, { x: state.baseX + dx, y: state.baseY + dy });
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
      
      let vx = state.vx * 1000;
      let vy = state.vy * 1000;
      
      if (Math.abs(vx) < 50 && Math.abs(vy) < 50) {
         vy = -200;
         vx = (Math.random() - 0.5) * 300;
      }
      
      vx = Math.max(-1500, Math.min(1500, vx));
      vy = Math.max(-1500, Math.min(1500, vy));

      gsap.to(block, {
        x: `+=${vx}`,
        y: `+=${vy + 1000}`,
        rotationZ: vx * 0.5,
        rotationX: 360 * Math.sign(vy || 1),
        rotationY: vx * 0.2,
        duration: 1.2,
        ease: "power2.in", 
        onComplete: () => {
          gsap.to(block, {
            x: 0, y: 0, z: 0, rotationZ: 0, rotationX: 0, rotationY: 0, scale: 0, opacity: 0, duration: 0, delay: 1.5,
            onComplete: () => {
               block.dataset.dragging = "false";
               block.parentNode.style.zIndex = 1;
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
    e.stopPropagation();
    const block = blocksRef.current[index];
    if(!block) return;
    
    block.dataset.dragging = "true";
    block.style.cursor = "grabbing";
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

    gsap.killTweensOf(block);
    gsap.to(block, { 
      scale: 1.8, 
      z: 100, 
      borderRadius: '0%',
      boxShadow: '2px 4px 8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)',
      duration: 0.2, 
      ease: "power2.out" 
    });
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const { clientX, clientY } = e;
    
    blocksRef.current.forEach((block) => {
      if (!block || block.dataset.dragging === "true") return;
      
      const rect = block.getBoundingClientRect();
      const bx = rect.left + rect.width / 2;
      const by = rect.top + rect.height / 2;
      const dist = Math.hypot(clientX - bx, clientY - by);
      
      const magnetRadius = Math.max(40, pixelSize * 8); 
      if (dist < magnetRadius) {
        const intensity = 1 - (dist / magnetRadius);
        gsap.to(block, {
          backgroundColor: block.dataset.hoverColor,
          scale: 1 + (0.3 * intensity),
          z: 20 * intensity,
          rotationX: (clientY - by) * 1.5 * intensity,
          rotationY: (bx - clientX) * 1.5 * intensity,
          borderRadius: `${20 * intensity}%`,
          duration: 0.15,
          ease: "power2.out",
          overwrite: "auto"
        });
      } else {
        gsap.to(block, {
          backgroundColor: block.dataset.origColor,
          scale: 1, z: 0, rotationX: 0, rotationY: 0, borderRadius: '0%', duration: 0.5, ease: "power2.out", overwrite: "auto"
        });
      }
    });
  };

  const handleMouseLeave = () => {
    blocksRef.current.forEach(block => {
      if (block && block.dataset.dragging !== "true") {
        gsap.to(block, {
          backgroundColor: block.dataset.origColor,
          scale: 1, z: 0, rotationX: 0, rotationY: 0, borderRadius: '0%', duration: 0.5, ease: "power2.out", overwrite: "auto"
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
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: `${gap}px`,
        perspective: '800px',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '8px'
      }}
    >
      {matrix.map((row, rIdx) => 
        row.map((val, cIdx) => {
          if (val === 1) {
            const currentIndex = blockIndex++;
            const hoverColor = getHoverColor(rIdx, cIdx);
            return (
              <div key={`${rIdx}-${cIdx}`} style={{ width: `${pixelSize}px`, height: `${pixelSize}px` }}>
                <div 
                  ref={el => blocksRef.current[currentIndex] = el}
                  data-orig-color={baseColor}
                  data-hover-color={hoverColor}
                  onPointerDown={(e) => handlePointerDown(e, currentIndex)}
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: baseColor,
                    borderRadius: '0',
                    transformOrigin: 'center center',
                    cursor: 'grab',
                    touchAction: 'none'
                  }}
                />
              </div>
            );
          }
          return <div key={`${rIdx}-${cIdx}`} style={{ width: `${pixelSize}px`, height: `${pixelSize}px` }} />;
        })
      )}
    </div>
  );
}
