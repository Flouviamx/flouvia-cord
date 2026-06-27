import { sql, withOrgTx } from './db';
import { createCotizacion } from './cotizaciones';

export async function seedDemoData(orgId: string, clerkUserId: string) {
    try {
        // 1. Insert dummy client
        const [[client]] = await withOrgTx(orgId,
            sql`insert into clientes (org_id, empresa, nombre_contacto, email, telefono, regimen_fiscal, notas)
                values (${orgId}, 'Acme Corp (Ejemplo)', 'Juan Pérez', 'juan.perez@example.com', '5551234567', '601', 'Cliente de prueba (Demo)')
                returning id`
        );

        // 2. Insert dummy product
        const [[product]] = await withOrgTx(orgId,
            sql`insert into productos (org_id, sku, nombre, descripcion, unidad, precio, costo, activo)
                values (${orgId}, 'UIUX-001', 'Servicio de Diseño UI/UX', 'Diseño de interfaz de usuario para portal web', 'servicio', 15000, 5000, true)
                returning id`
        );

        // 3. Create dummy quote
        await createCotizacion(orgId, {
            cliente_id: client.id as string,
            terminos: 'net30',
            vigencia_dias: 30,
            notas: '{"is_demo": true}',
            send: true,
            items: [{
                producto_id: product.id as string,
                descripcion: 'Servicio de Diseño UI/UX',
                cantidad: 1,
                precio_unitario: 15000
            }]
        }, {
            origin: 'https://cord.flouvia.com',
            ip: '127.0.0.1',
            actor: 'onboarding'
        });
    } catch (e) {
        console.error('[onboarding] Error al sembrar datos:', e);
    }
}
