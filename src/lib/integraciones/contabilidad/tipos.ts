// La forma que Cord manda a cualquier contabilidad. Cada proveedor la traduce a
// su API; el servicio la arma una sola vez desde la factura de Cord.

export interface TokensConta {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
}

export interface ContaCliente {
    nombre: string;
    email: string | null;
    telefono: string | null;
}

export interface LineaConta {
    descripcion: string;
    cantidad: number;
    precio: number;
    importe: number;
}

export interface FacturaConta {
    folio: string;
    /** YYYY-MM-DD en la zona de la organización. */
    fecha: string;
    vence: string | null;
    moneda: string;
    lineas: LineaConta[];
}
