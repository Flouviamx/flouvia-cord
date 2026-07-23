import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function WireframeText({ text = 'DEVELOPERS' }) {
  const containerRef = useRef(null);
  const layers = 24;

  useEffect(() => {
    const texts = containerRef.current.querySelectorAll('.wire-layer');
    
    // Animación sutil de respiración o parallax al hacer scroll
    gsap.to(texts, {
      y: (i) => i * 8, // Extrusión dinámica
      ease: "sine.inOut",
      duration: 2,
      yoyo: true,
      repeat: -1,
      stagger: {
        each: 0.02,
        from: "start"
      }
    });
  }, []);

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        overflow: 'hidden', 
        display: 'flex', 
        justifyContent: 'center',
        padding: '0',
        marginTop: '-20px' // Acercar al contenido
      }}
    >
      <svg 
        viewBox="0 0 1200 350" 
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <style>
            {`
              .wire-text-base {
                font-family: var(--dev-mono, monospace);
                font-size: 260px;
                font-weight: 300; /* Letra delgada como en la referencia */
                letter-spacing: -12px;
                text-anchor: middle;
                alignment-baseline: central;
              }
            `}
          </style>
        </defs>
        
        {Array.from({ length: layers }).reverse().map((_, revIdx) => {
          const i = layers - 1 - revIdx; // Dibujar de atrás hacia adelante
          const isTop = i === 0;
          
          return (
            <text 
              key={i}
              x="600" 
              y={120} // Posición base inicial
              className={`wire-text-base ${!isTop ? 'wire-layer' : ''}`}
              fill={isTop ? "#ffffff" : "transparent"}
              stroke={isTop ? "none" : "rgba(255,255,255,0.15)"}
              strokeWidth={isTop ? 0 : 1}
              style={{
                transform: `translateY(${i * 6}px)` // Posición inicial fija, luego GSAP la anima
              }}
            >
              {text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
