import React, { useState, useEffect } from 'react';
import '../../styles/testimonial-carousel.css';

export default function TestimonialCarousel({ items, isDarkMode = false }) {
    const [activeIndex, setActiveIndex] = useState(0);

    // Auto-play feature (optional, let's keep it manual like Stripe to avoid annoyance, 
    // or we can auto-play if no interaction)
    useEffect(() => {
        const timer = setInterval(() => {
            setActiveIndex((current) => (current + 1) % items.length);
        }, 8000);
        return () => clearInterval(timer);
    }, [items.length]);

    if (!items || items.length === 0) return null;

    return (
        <div className={`testimonial-carousel-wrapper ${isDarkMode ? 'dark-mode-tab' : ''}`}>
            <div className="tc-card">
                {/* Background Layers */}
                {items.map((item, index) => (
                    <div 
                        key={`bg-${item.id}`}
                        className={`tc-bg-layer ${index === activeIndex ? 'active' : ''}`}
                        style={{ background: item.bgGradient || item.bgColor || '#0f172a' }}
                    >
                        {item.bgImage && (
                            <img src={item.bgImage} alt="" className="tc-bg-image" />
                        )}
                    </div>
                ))}

                {/* Content Layers */}
                {items.map((item, index) => (
                    <div 
                        key={item.id} 
                        className={`tc-content-wrapper ${index === activeIndex ? 'active' : ''}`}
                    >
                        <div className="tc-text">
                            <div className="tc-quote">{item.quote}</div>
                            <div className="tc-author">{item.author}</div>
                        </div>
                        <div className="tc-visual">
                            {item.logoUrl && (
                                <div className="tc-logo-wrapper">
                                    <img src={item.logoUrl} alt={item.name} className="tc-logo-large" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                <div className="tc-indicators">
                    {items.map((item, index) => (
                        <button
                            key={`ind-${item.id}`}
                            className={`tc-indicator ${index === activeIndex ? 'active' : ''}`}
                            onClick={() => setActiveIndex(index)}
                            aria-label={`Go to slide ${index + 1}`}
                        />
                    ))}
                </div>
            </div>

            <div className="tc-nav-tabs">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        className={`tc-nav-btn ${index === activeIndex ? 'active' : ''}`}
                        onClick={() => setActiveIndex(index)}
                        aria-label={`Show ${item.name} testimonial`}
                    >
                        {item.logoUrl && (
                            <div className="tc-nav-icon-wrapper">
                                <img src={item.logoUrl} alt="" className="tc-nav-icon" />
                            </div>
                        )}
                        <span className="tc-nav-name">{item.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
