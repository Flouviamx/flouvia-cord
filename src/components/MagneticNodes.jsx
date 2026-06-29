import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import './MagneticNodes.css';

export default function MagneticNodes({ nodes }) {
    const containerRef = useRef(null);

    useEffect(() => {
        // Zero Gravity Animation (Idle)
        const ctx = gsap.context(() => {
            const floaters = gsap.utils.toArray('.integration-node-float');
            
            floaters.forEach((el) => {
                // Matemáticas aleatorias para que cada nodo flote distinto
                const duration = gsap.utils.random(4, 7);
                const yOff = gsap.utils.random(10, 20);
                const xOff = gsap.utils.random(-8, 8);
                const delay = gsap.utils.random(0, -5);
                
                gsap.to(el, {
                    y: yOff,
                    x: xOff,
                    duration: duration,
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                    delay: delay
                });
            });
        }, containerRef);

        return () => ctx.revert();
    }, []);

    // Interacción Magnética (Hover)
    const handleMouseMove = (e) => {
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        
        // Centro del elemento
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Distancia del cursor al centro
        const distanceX = e.clientX - centerX;
        const distanceY = e.clientY - centerY;
        
        const magneticTarget = target.querySelector('.integration-node');
        
        // Atraer ligeramente hacia el cursor (efecto imán, intensidad 0.4)
        gsap.to(magneticTarget, {
            x: distanceX * 0.4,
            y: distanceY * 0.4,
            duration: 0.4,
            ease: 'power2.out',
            overwrite: 'auto' // Evita conflictos si se mueve rápido
        });
    };

    const handleMouseLeave = (e) => {
        const magneticTarget = e.currentTarget.querySelector('.integration-node');
        
        // Regresar a la posición original usando elastic.out(1, 0.3)
        gsap.to(magneticTarget, {
            x: 0,
            y: 0,
            duration: 1.2,
            ease: 'elastic.out(1, 0.3)'
        });
    };

    return (
        <div ref={containerRef} className="magnetic-nodes-container">
            {nodes.map((node, i) => (
                <div 
                    key={i} 
                    className="integration-node-wrapper"
                    style={{ 
                        position: 'absolute', 
                        top: node.top, 
                        left: node.left, 
                        width: node.width, 
                        height: node.width,
                        zIndex: node.zIndex || 1
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* Contenedor flotante pasivo */}
                    <div className="integration-node-float" style={{ width: '100%', height: '100%' }}>
                        {/* Nodo magnético activo */}
                        <div className="integration-node">
                            <img src={node.src} alt={node.alt} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
