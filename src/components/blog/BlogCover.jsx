import CordDynamicBg from '../CordDynamicBg.jsx';

// BlogCover — portada de tarjeta de blog.
// Ya NO tiene motor GLSL propio: el fondo es el shader ESTÁNDAR de Cord
// (CordDynamicBg). Este componente solo aporta lo que es suyo: la paleta por
// categoría y el overlay de título (scrim + texto), que vive FUERA del canvas.
//
// Las paletas conservan el espíritu del mapa `PAL` original (dark → mid →
// highlight por categoría) traducido al contrato de 4 colores de CordDynamicBg:
// base (fondo) + 3 acentos.

const PAL = {
  // Finanzas — navy profundo → azul → azure eléctrico
  'Finanzas':    { base: '#0A1940', color1: '#17427F', color2: '#3B82F5', color3: '#60A5FA' },
  'Finance':     { base: '#0A1940', color1: '#17427F', color2: '#3B82F5', color3: '#60A5FA' },
  // Ventas B2B — teal oscuro → océano → cyan
  'Ventas B2B':  { base: '#082238', color1: '#0A6389', color2: '#05B8D9', color3: '#22D3EE' },
  'B2B Sales':   { base: '#082238', color1: '#0A6389', color2: '#05B8D9', color3: '#22D3EE' },
  // Fiscal — bosque → esmeralda → menta
  'Fiscal':      { base: '#08291C', color1: '#0F5C38', color2: '#0DB57F', color3: '#34D399' },
  // Tecnología — púrpura muy oscuro → violeta → lavanda
  'Tecnología':  { base: '#170839', color1: '#4A1A91', color2: '#8C5CFA', color3: '#A78BFA' },
  'Technology':  { base: '#170839', color1: '#4A1A91', color2: '#8C5CFA', color3: '#A78BFA' },
  // Operaciones — cálido oscuro → naranja → oro
  'Operaciones': { base: '#2A0C00', color1: '#782B0F', color2: '#F77014', color3: '#FBBF24' },
  'Operations':  { base: '#2A0C00', color1: '#782B0F', color2: '#F77014', color3: '#FBBF24' },
  // featured — azul premium
  'featured':    { base: '#05122B', color1: '#1C458C', color2: '#5E9CFD', color3: '#93C5FD' },
};

const DEFAULT_PAL = { base: '#0F1726', color1: '#1C385E', color2: '#61A6FA', color3: '#93C5FD' };

export default function BlogCover({ category = 'default', featured = false, title = '' }) {
  const colors = PAL[category] || DEFAULT_PAL;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <CordDynamicBg colors={colors} grain={false} />

      {/* Overlay de título — sobre el canvas, nunca dentro del shader */}
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
            WebkitLineClamp: 3,
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
