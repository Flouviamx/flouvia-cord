import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'src/content/support');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const articlesToCreate = [
    // --- Pagos y Depósitos (Needs 8) ---
    { slug: 'pagos-internacionales', category: 'Pagos y Depósitos', title: 'Recibir pagos internacionales', desc: 'Acepta tarjetas emitidas en el extranjero con Cord.' },
    { slug: 'cobro-divisas', category: 'Pagos y Depósitos', title: 'Cobro en múltiples divisas', desc: 'Cómo cobrar en USD y liquidar en MXN.' },
    { slug: 'pagos-rechazados', category: 'Pagos y Depósitos', title: 'Razones de pagos rechazados', desc: 'Códigos de error bancarios comunes y cómo solucionarlos.' },
    { slug: 'conciliacion-depositos', category: 'Pagos y Depósitos', title: 'Conciliación de depósitos', desc: 'Exporta reportes para empatar depósitos con tu contabilidad.' },
    { slug: 'cambiar-frecuencia-pagos', category: 'Pagos y Depósitos', title: 'Cambiar frecuencia de depósitos', desc: 'Elige entre depósitos diarios, semanales o mensuales.' },
    { slug: 'limites-procesamiento', category: 'Pagos y Depósitos', title: 'Límites de procesamiento', desc: 'Montos máximos transaccionales y cómo solicitar un aumento.' },
    { slug: 'msi-meses-sin-intereses', category: 'Pagos y Depósitos', title: 'Ofrecer Meses Sin Intereses (MSI)', desc: 'Activa 3, 6, 9 o 12 meses sin intereses para tus clientes.' },
    { slug: 'pagos-en-efectivo', category: 'Pagos y Depósitos', title: 'Recepción de pagos en efectivo', desc: 'Habilitar cobros en Oxxo y tiendas de conveniencia.' },

    // --- Cotizaciones (Needs 4) ---
    { slug: 'cotizaciones-multimoneda', category: 'Cotizaciones', title: 'Cotizaciones multimoneda', desc: 'Envía propuestas en USD, EUR o MXN.' },
    { slug: 'descuentos-promociones', category: 'Cotizaciones', title: 'Aplicar descuentos o promociones', desc: 'Agrega descuentos por línea o totales a tu propuesta.' },
    { slug: 'vigencia-cotizacion', category: 'Cotizaciones', title: 'Configurar vigencia de cotización', desc: 'Añade una fecha de expiración automática a tus propuestas.' },
    { slug: 'clonacion-cotizaciones', category: 'Cotizaciones', title: 'Duplicar o clonar cotizaciones', desc: 'Acelera tu proceso clonando propuestas anteriores.' },

    // --- Facturación y CFDI (Needs 11) ---
    { slug: 'facturar-publico-general', category: 'Facturación y CFDI', title: 'Facturación al Público en General', desc: 'Emisión de CFDI global diario o mensual.' },
    { slug: 'cancelar-cfdi-relacionados', category: 'Facturación y CFDI', title: 'Cancelación con CFDI Relacionado (01)', desc: 'Sustituye facturas con errores correctamente.' },
    { slug: 'nota-de-credito', category: 'Facturación y CFDI', title: 'Emitir Nota de Crédito (Egreso)', desc: 'Aplica devoluciones y bonificaciones legales.' },
    { slug: 'facturacion-anticipos', category: 'Facturación y CFDI', title: 'Facturar anticipos', desc: 'Emite el CFDI de anticipo y su remanente.' },
    { slug: 'retenciones-impuestos', category: 'Facturación y CFDI', title: 'Configurar retenciones (ISR/IVA)', desc: 'Aplica retenciones automáticamente según el régimen.' },
    { slug: 'cfdi-traslado', category: 'Facturación y CFDI', title: 'Emitir CFDI de Traslado (Carta Porte)', desc: 'Configuración para empresas de logística o mercancías.' },
    { slug: 'catalogo-clientes-rfc', category: 'Facturación y CFDI', title: 'Catálogo de clientes y RFC', desc: 'Gestión y validación de RFCs en la lista de clientes.' },
    { slug: 'csd-vencido', category: 'Facturación y CFDI', title: 'Qué hacer si tu CSD caducó', desc: 'Pasos para subir tu nuevo Certificado de Sello Digital.' },
    { slug: 'facturas-extranjero', category: 'Facturación y CFDI', title: 'Facturar a clientes en el extranjero', desc: 'Uso del RFC genérico extranjero y Tax ID.' },
    { slug: 'envio-masivo-facturas', category: 'Facturación y CFDI', title: 'Envío masivo de facturas por correo', desc: 'Reenvía el PDF y XML a múltiples clientes.' },
    { slug: 'descargar-xml', category: 'Facturación y CFDI', title: 'Descarga masiva de XMLs', desc: 'Exporta tus facturas del mes en formato ZIP para tu contador.' },

    // --- Cuenta y Equipo (Needs 5) ---
    { slug: 'sso-empresarial', category: 'Cuenta y Equipo', title: 'Single Sign-On (SSO)', desc: 'Habilita acceso con Google Workspace o Microsoft Entra.' },
    { slug: 'cambiar-razon-social', category: 'Cuenta y Equipo', title: 'Cambiar Razón Social', desc: 'Pasos legales para transferir tu cuenta Cord a otra empresa.' },
    { slug: 'multiples-empresas', category: 'Cuenta y Equipo', title: 'Manejar múltiples empresas', desc: 'Alterna entre distintas razones sociales desde una sola cuenta.' },
    { slug: 'borrar-cuenta', category: 'Cuenta y Equipo', title: 'Eliminar cuenta de Cord', desc: 'Proceso de cierre y exportación final de datos.' },
    { slug: 'facturacion-anual', category: 'Cuenta y Equipo', title: 'Suscripción con facturación anual', desc: 'Cambia a pago anual y ahorra 20% en tu plan Cord.' },

    // --- Desarrolladores (Needs 10) ---
    { slug: 'api-cotizaciones', category: 'Desarrolladores', title: 'API: Crear cotizaciones', desc: 'Endpoint para generar y enviar cotizaciones programáticamente.' },
    { slug: 'api-clientes', category: 'Desarrolladores', title: 'API: Gestionar clientes', desc: 'Sincroniza el catálogo de clientes con tu ERP.' },
    { slug: 'api-facturas', category: 'Desarrolladores', title: 'API: Emitir y descargar facturas', desc: 'Timbra CFDI 4.0 directamente desde tus sistemas internos.' },
    { slug: 'firmas-webhooks', category: 'Desarrolladores', title: 'Verificar firmas de Webhooks', desc: 'Implementación criptográfica para validar eventos.' },
    { slug: 'idempotencia', category: 'Desarrolladores', title: 'Claves de Idempotencia', desc: 'Evita cargos duplicados usando llaves de idempotencia.' },
    { slug: 'sandbox-pruebas', category: 'Desarrolladores', title: 'Entorno de Pruebas (Sandbox)', desc: 'Simula pagos, rechazos y facturas sin dinero real.' },
    { slug: 'tarjetas-prueba', category: 'Desarrolladores', title: 'Números de tarjeta de prueba', desc: 'Lista de PANs para simular flujos 3D Secure y fallos.' },
    { slug: 'react-sdk', category: 'Desarrolladores', title: 'Cord React SDK', desc: 'Instalación y uso de @cord/react en tu frontend.' },
    { slug: 'node-sdk', category: 'Desarrolladores', title: 'Cord Node.js SDK', desc: 'Instalación y uso de @cord/node en tu backend.' },
    { slug: 'errores-api', category: 'Desarrolladores', title: 'Manejo de códigos de error API', desc: 'Significado de HTTP 400, 401, 402, 404 y 500 en Cord.' },

    // --- Seguridad y Privacidad (Needs 1) ---
    { slug: 'auditorias-seguridad', category: 'Seguridad y Privacidad', title: 'Auditorías y Certificaciones SOC2', desc: 'Reportes de auditoría técnica disponibles para planes Enterprise.' },
];

let created = 0;
for (const art of articlesToCreate) {
    const content = `---
title: "${art.title}"
description: "${art.desc}"
category: "${art.category}"
---

# ${art.title}

${art.desc}

*Este artículo fue generado automáticamente por Cord Docs Engine.*
`;
    const filePath = path.join(outDir, `${art.slug}.md`);
    fs.writeFileSync(filePath, content);
    created++;
}

console.log(`Successfully created ${created} support articles.`);
