// El proveedor de transmisión configurado, o null si el riel está apagado.
// Hoy solo existe Iopole; otro proveedor se suma aquí y en su carpeta, sin
// tocar la cola ni el alta.

import { paConfig } from './config';
import type { ProveedorTransmision } from './proveedor';
import { IopoleCliente } from './iopole/cliente';

export function proveedorConfigurado(): ProveedorTransmision | null {
    return IopoleCliente.desdeConfig(paConfig());
}
