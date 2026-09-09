// Tarifas fijas EUR aprobadas; no son conversiones de FX en tiempo real.
// Developer se negocia por ventas: no se inventa una tarifa EUR para ese contrato.
export const EUR_MONTHLY = { free: 0, starter: 12, pro: 30, scale: 70 } as const;
// Unidades mínimas EUR por evento del meter. API se mide por solicitud:
// 0.03 céntimos/solicitud = 0.03 EUR por 100 solicitudes.
export const EUR_METER_MINOR = {
    starter: { api: '0.03', ia: '20', timbrado: '15' },
    pro: { api: '0.03', usuario: '1500', ia: '17.5', timbrado: '15' },
    scale: { api: '0.02', usuario: '1500', ia: '15', timbrado: '10' },
} as const;
