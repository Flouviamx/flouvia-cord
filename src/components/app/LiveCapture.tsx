import React, { useRef, useState, useEffect } from 'react';
import { relacionDeAspecto, type TipoDocumento } from '../../lib/identity-documents';
import { medir, evaluar, consejo, type MetricasCaptura } from '../../lib/capture-quality';

interface LiveCaptureProps {
    locale?: 'es' | 'en';
    onCapture: (file: File, metricas?: Record<string, number> | null) => void;
    onCancel: () => void;
    // `selfie` se retiró: esa foto se subía al campo de comprobante de
    // domicilio del proveedor, que no es una prueba de vida. `address` es el uso
    // real de ese campo.
    side: 'front' | 'back' | 'address';
    /** Familia del documento: decide la FORMA del marco guía. */
    tipoDocumento?: string;
}

/** Traduce el fallo de getUserMedia a algo que la persona pueda accionar. */
function mensajeDeError(err: any, en: boolean): string {
    switch (err?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return en
                ? "The browser blocked camera access. Allow it in the site settings, or use “Choose a photo instead”."
                : 'El navegador bloqueó la cámara. Permítela en los ajustes del sitio, o usa “Elegir foto de la galería”.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return en
                ? "We couldn't find a usable camera on this device. Use “Choose a photo instead”."
                : 'No encontramos una cámara utilizable en este dispositivo. Usa “Elegir foto de la galería”.';
        case 'NotReadableError':
            return en
                ? 'Another app is using the camera. Close it and try again.'
                : 'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.';
        default:
            return en
                ? "We couldn't open the camera. Use “Choose a photo instead”."
                : 'No pudimos abrir la cámara. Usa “Elegir foto de la galería”.';
    }
}

export default function LiveCapture({ onCapture, onCancel, side, locale = 'es', tipoDocumento }: LiveCaptureProps) {
    const en = locale === 'en';
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // El stream vive en un REF, no en estado.
    //
    // El cleanup del `useEffect([])` se crea en el primer render, donde `stream`
    // todavía es `null`, así que `stopCamera()` cerraba sobre ese null: al pulsar
    // "Cancelar" el componente se desmontaba y **los tracks seguían vivos**. En
    // una pantalla de verificación de identidad, dejar la cámara encendida
    // después de que la persona dijo que no es un problema de privacidad, no de
    // rendimiento. Un ref siempre apunta al valor vigente.
    const streamRef = useRef<MediaStream | null>(null);
    /** Los bytes reales de la foto. La vista previa es sólo un object URL. */
    const blobRef = useRef<Blob | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Consejo cuando la foto es usable pero mejorable. No bloquea. */
    const [aviso, setAviso] = useState<string | null>(null);
    /** Las métricas viajan con la subida para poder calibrar los umbrales. */
    const [metricas, setMetricas] = useState<MetricasCaptura | null>(null);

    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
            if (blobRef.current) blobRef.current = null;
        };
    }, []);

    const startCamera = async () => {
        setError(null);
        try {
            // `facingMode: { ideal }`, NUNCA `{ exact }`: con `exact` una laptop
            // sin cámara trasera lanza OverconstrainedError y mata el carril de
            // escritorio. Se pide resolución alta porque el default del stream
            // ronda 640×480 en Android, y con una ROI del 80% eso son ~512 px de
            // lado largo del documento — por debajo de lo legible para OCR antes
            // siquiera de hablar de nitidez.
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 2560 },
                    height: { ideal: 1440 },
                },
                audio: false,
            });
            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play();
            }
        } catch (err: any) {
            // Cada causa tiene una salida distinta, y decir "revisa los permisos"
            // cuando el problema es que otra app tiene la cámara ocupada manda al
            // usuario a un callejón. Además, si el permiso está bloqueado a nivel
            // sitio, "Reintentar" no lo desbloquea — por eso el carril de archivo
            // vive fuera de este componente y siempre está visible.
            setError(mensajeDeError(err, en));
            console.error(err);
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    // Cancelar apaga la cámara ANTES de avisar al padre: el desmontaje ya no es
    // lo único que la detiene.
    const cancelar = () => {
        stopCamera();
        onCancel();
    };

    const takePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Techo de 4000 px de lado largo. Tres razones concretas:
        //   · el proveedor rechaza cualquier lado > 8000 px;
        //   · Safari en iOS devuelve un canvas NEGRO por encima de ~16.7 Mpx de
        //     área, y 4096×4096 ya lo roza;
        //   · por encima de eso no se gana legibilidad, sólo peso.
        const MAX_LADO = 4000;
        const escala = Math.min(1, MAX_LADO / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // El documento se sube COMPLETO, sin recortar al marco. El proveedor es
        // literal: "no deben estar recortados… todos los bordes deben ser
        // visibles". Un recorte ceñido produce exactamente el rechazo por
        // documento incompleto que este trabajo busca evitar.
        const blob = await codificar(canvas);
        if (!blob) {
            setError(en ? "We couldn't process the photo. Try again." : 'No pudimos procesar la foto. Inténtalo de nuevo.');
            return;
        }
        // ── Compuertas de calidad, sobre la ROI y normalizadas ──────────────
        //
        // Se mide sobre el recorte del MARCO, no sobre el frame completo: el
        // fondo suele estar enfocado aunque el documento no lo esté, y medir todo
        // el cuadro daba una nitidez buena con la credencial borrosa.
        //
        // Se re-muestrea a 800 px de lado largo porque la varianza del laplaciano
        // depende de la escala: sin normalizar, dos teléfonos con sensores
        // distintos darían números incomparables y ningún umbral significaría
        // nada.
        const m = medirRegion(ctx, canvas);
        setMetricas(m);
        const v = m ? evaluar(m, side !== 'address') : { severidad: 'ok' as const, motivo: null };
        if (v.severidad === 'bloqueo') {
            // Sólo dos cosas bloquean, y ambas son un rechazo garantizado del
            // proveedor: dejarlas pasar le cuesta al usuario un ciclo de días.
            setError(consejo(v.motivo!, locale));
            return;
        }
        setAviso(v.severidad === 'aviso' ? consejo(v.motivo!, locale) : null);

        blobRef.current = blob;
        setCapturedImage(URL.createObjectURL(blob));
        stopCamera();
    };

    /**
     * Recorta el marco guía y mide sobre él.
     *
     * El `<video>` se pinta con `object-fit: cover`, así que el rectángulo del
     * marco en píxeles CSS NO corresponde linealmente al canvas. Aquí se usa la
     * misma proporción relativa que la guía (86% del ancho, con la relación de
     * aspecto del documento), que es lo que el usuario realmente ve.
     */
    const medirRegion = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): MetricasCaptura | null => {
        try {
            const ratio = relacionDeAspecto((tipoDocumento as TipoDocumento) || 'id_nacional');
            const roiW = Math.round(canvas.width * 0.86);
            const roiH = Math.min(Math.round(roiW / ratio), Math.round(canvas.height * 0.64));
            const roiX = Math.round((canvas.width - roiW) / 2);
            const roiY = Math.round((canvas.height - roiH) / 2);
            if (roiW < 8 || roiH < 8) return null;

            // Re-muestreo a 800 px de lado largo con un `drawImage`: el resampleo
            // lo hace el navegador y es prácticamente gratis.
            const destLado = 800;
            const escala = Math.min(1, destLado / Math.max(roiW, roiH));
            const dw = Math.max(8, Math.round(roiW * escala));
            const dh = Math.max(8, Math.round(roiH * escala));
            const tmp = document.createElement('canvas');
            tmp.width = dw; tmp.height = dh;
            const tctx = tmp.getContext('2d', { willReadFrequently: true });
            if (!tctx) return null;
            tctx.drawImage(canvas, roiX, roiY, roiW, roiH, 0, 0, dw, dh);
            return medir(tctx.getImageData(0, 0, dw, dh).data, dw, dh, roiW);
        } catch {
            // Sin métricas se sigue adelante: son una ayuda, no un requisito.
            return null;
        }
    };

    /**
     * Escalera de calidad hasta caber en el límite del proveedor.
     *
     * `toBlob` en vez de `toDataURL`: el data URL construye una cadena base64
     * (~1.37× los bytes) que después había que volver a convertir con
     * `fetch(dataUrl)` — dos copias completas de la imagen en memoria, en un
     * teléfono, gratis de eliminar.
     *
     * Nunca baja de 0.70: por debajo, el ringing del JPEG empieza a comerse la
     * letra chica del documento, y "demasiado comprimido" tiene su propio modo de
     * rechazo por ilegible.
     */
    const codificar = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
        const MAX_BYTES = 9.5 * 1024 * 1024; // margen bajo el tope de 10 MB
        for (const q of [0.92, 0.85, 0.78, 0.7]) {
            const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
            if (!blob) return null;
            if (blob.size <= MAX_BYTES) return blob;
        }
        return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.7));
    };

    const retake = () => {
        // El object URL se revoca a mano: un blob de varios MB por reintento se
        // queda en memoria hasta que se recolecte la página entera.
        if (capturedImage) URL.revokeObjectURL(capturedImage);
        blobRef.current = null;
        setCapturedImage(null);
        setAviso(null);
        setMetricas(null);
        startCamera();
    };

    const confirmPhoto = () => {
        const blob = blobRef.current;
        if (!blob) return;
        setLoading(true);
        // El nombre se regenera igual en el servidor (`guardUpload`); aquí sólo
        // importa que la extensión y el tipo coincidan con los bytes.
        onCapture(
            new File([blob], `capture_${side}_${Date.now()}.jpg`, { type: 'image/jpeg' }),
            metricas as unknown as Record<string, number> | null,
        );
    };

    // Ni español fijo ni "INE": la identificación se llama distinto en cada uno
    // de los ocho mercados, y el rótulo 'Selfie' era residuo del flujo eliminado.
    const T = en
        ? {
            front: { titulo: 'Front of ID', guia: 'Photograph the front of your ID' },
            back: { titulo: 'Back of ID', guia: 'Photograph the back of your ID' },
            address: { titulo: 'Proof of address', guia: 'Photograph your proof of address' },
        }
        : {
            front: { titulo: 'Frente', guia: 'Toma foto del frente de tu identificación' },
            back: { titulo: 'Reverso', guia: 'Toma foto del reverso de tu identificación' },
            address: { titulo: 'Comprobante', guia: 'Toma foto de tu comprobante de domicilio' },
        };
    const instructions = T[side].guia;

    return (
        <div style={{ position: 'fixed', inset: 0, minHeight: '100dvh', background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 'calc(12px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 12px max(12px, env(safe-area-inset-left))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', zIndex: 10 }}>
                <button type="button" onClick={cancelar} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '10px' }}>{en ? 'Cancel' : 'Cancelar'}</button>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{T[side].titulo}</span>
                <div style={{ width: '80px' }}></div>
            </div>

            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {error ? (
                    <div style={{ color: '#fff', textAlign: 'center', padding: '20px' }}>
                        <p>{error}</p>
                        <button type="button" onClick={startCamera} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', marginTop: '10px' }}>{en ? 'Retry' : 'Reintentar'}</button>
                    </div>
                ) : (
                    <>
                        {!capturedImage && (
                            <video 
                                ref={videoRef} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                playsInline 
                                muted 
                                autoPlay
                            />
                        )}
                        {capturedImage && (
                            <img src={capturedImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Captura" />
                        )}
                        {/* El aviso ACONSEJA, no bloquea: se ve el consejo y el
                            botón de confirmar sigue habilitado. Rechazar una foto
                            buena por un umbral mal calibrado deja a un negocio sin
                            poder cobrar, que es mucho peor que aceptar una regular. */}
                        {capturedImage && aviso && (
                            <div style={{
                                position: 'absolute', left: 16, right: 16, bottom: 16,
                                background: 'rgba(0,0,0,0.78)', color: '#fff',
                                padding: '12px 14px', borderRadius: 12,
                                fontSize: '0.85rem', lineHeight: 1.45, textAlign: 'center',
                            }} role="status">{aviso}</div>
                        )}
                        
                        {!capturedImage && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                                {/* El marco tenía 80% × 30% del viewport, o sea ~1.23:1,
                                    que no corresponde a NINGÚN documento real. Ahora
                                    lleva la relación de la familia elegida: 1.586:1 para
                                    una ID-1 (INE, DNI, licencia, CNH) y 1.42:1 para la
                                    página de datos de un pasaporte.

                                    `aspectRatio` con `width` es lo que hace que el alto
                                    se derive solo: un marco con la forma correcta es la
                                    guía más barata y la que más rechazos evita. */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    width: '86%',
                                    maxHeight: '64%',
                                    aspectRatio: String(relacionDeAspecto((tipoDocumento as TipoDocumento) || 'id_nacional')),
                                    border: '2px solid rgba(255,255,255,0.7)',
                                    borderRadius: '12px',
                                    boxShadow: '0 0 0 4000px rgba(0,0,0,0.5)'
                                }}></div>
                                <div style={{ position: 'absolute', bottom: '20%', width: '100%', textAlign: 'center', color: '#fff', fontSize: '0.9rem', fontWeight: 500, padding: '0 20px' }}>
                                    {instructions}
                                </div>
                            </div>
                        )}
                        
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </>
                )}
            </div>

            <div style={{ padding: '22px max(16px, env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))', display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '14px', background: '#000' }}>
                {!capturedImage ? (
                    <button 
                        type="button" 
                        onClick={takePhoto} 
                        style={{ width: '70px', height: '70px', borderRadius: '50%', border: '4px solid #fff', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#fff' }}></div>
                    </button>
                ) : (
                    <>
                        <button type="button" onClick={retake} style={{ padding: '14px 24px', background: '#333', color: '#fff', border: 'none', borderRadius: '30px', fontSize: '1rem', cursor: 'pointer' }}>{en ? 'Retake' : 'Tomar otra'}</button>
                        <button type="button" onClick={confirmPhoto} disabled={loading} style={{ padding: '14px 24px', background: '#fff', color: '#000', border: 'none', borderRadius: '30px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
                            {loading ? 'Subiendo...' : 'Usar foto'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
