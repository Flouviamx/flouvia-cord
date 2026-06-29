import React, { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import './MagneticNodes.css';

export default function MagneticNodes({ nodes }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);

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

    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;
        
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Sincronizar el tamaño del canvas con el contenedor
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                canvas.width = width;
                canvas.height = height;
            }
        });
        resizeObserver.observe(container);

        // Loop de Renderizado (60fps) usando gsap.ticker
        const renderNetwork = () => {
            // Limpiar canvas en cada frame
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const containerRect = container.getBoundingClientRect();
            const nodeElements = container.querySelectorAll('.integration-node');
            const points = [];
            
            // Obtener coordenadas de los nodos relativas al canvas
            nodeElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) - containerRect.left;
                const y = (rect.top + rect.height / 2) - containerRect.top;
                points.push({ x, y });
            });
            
            // Límite de conexión
            const MAX_DISTANCE = 300;
            
            // Matemática de la tensión (Euclidiana) y Dibujo Dinámico
            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    const p1 = points[i];
                    const p2 = points[j];
                    
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < MAX_DISTANCE) {
                        // Inversamente proporcional: más cerca = más opaco y más grueso
                        const ratio = 1 - (distance / MAX_DISTANCE);
                        const opacity = ratio * 0.4;
                        const lineWidth = ratio * 1.5;
                        
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        // Dirección de Arte (Modo Claro)
                        ctx.strokeStyle = `rgba(156, 163, 175, ${opacity})`;
                        ctx.lineWidth = lineWidth;
                        ctx.stroke();
                    }
                }
            }
        };

        gsap.ticker.add(renderNetwork);

        return () => {
            resizeObserver.disconnect();
            gsap.ticker.remove(renderNetwork);
        };
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
        
        // Atraer ligeramente hacia el cursor (efecto imán)
        gsap.to(magneticTarget, {
            x: distanceX * 0.4,
            y: distanceY * 0.4,
            duration: 0.4,
            ease: 'power2.out',
            overwrite: 'auto'
        });
    };

    const handleMouseLeave = (e) => {
        const magneticTarget = e.currentTarget.querySelector('.integration-node');
        
        // Regresar a la posición original usando elastic.out
        gsap.to(magneticTarget, {
            x: 0,
            y: 0,
            duration: 1.2,
            ease: 'elastic.out(1, 0.3)'
        });
    };

    return (
        <div ref={containerRef} className="magnetic-nodes-container">
            {/* Canvas para la red conectiva */}
            <canvas 
                ref={canvasRef} 
                className="magnetic-nodes-canvas"
            ></canvas>

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
