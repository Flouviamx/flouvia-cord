// src/components/dev-blog/PixelButton.jsx
import React, { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';

export default function PixelButton({ children, href, active, color = '#10b981' }) {
  const [mounted, setMounted] = useState(false);
  const blocksRef = useRef([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = () => {
    // Glitch animation on hover
    blocksRef.current.forEach((block) => {
      if (!block) return;
      // 15% chance for a pixel to glitch, giving an irregular shader effect on the edges
      if (Math.random() > 0.85) {
        gsap.to(block, {
          opacity: 0,
          duration: 0.05,
          yoyo: true,
          repeat: Math.floor(Math.random() * 3) * 2 + 1, // random odd number
          ease: "steps(1)",
          onComplete: () => {
            gsap.to(block, { opacity: 1, duration: 0.1 });
          }
        });
      }
    });
  };

  return (
    <a 
      href={href} 
      onMouseEnter={handleMouseEnter}
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
      {/* Solid inner core guarantees 100% text readability */}
      <div style={{
        position: 'absolute',
        inset: '3px', 
        backgroundColor: active ? color : 'rgba(255,255,255,0.03)',
        zIndex: 0,
        borderRadius: '1px' // Slight rounding inside
      }} />

      {/* Irregular Pixel Edges Container */}
      {mounted && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexWrap: 'wrap',
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: 400 }).map((_, i) => {
             // Drop 8% of pixels. Because the inner core is solid, only the edges will look jagged!
             const isMissing = Math.random() > 0.92;
             return (
               <div 
                 key={i} 
                 ref={el => blocksRef.current[i] = el}
                 style={{
                   width: '4px',
                   height: '4px',
                   flexShrink: 0,
                   backgroundColor: isMissing ? 'transparent' : (active ? color : 'rgba(255,255,255,0.03)'),
                 }} 
               />
             )
          })}
        </div>
      )}
      
      {/* Content wrapper */}
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </a>
  );
}
