import React, { useRef, useState, useEffect } from 'react';

interface LiveCaptureProps {
    locale?: 'es' | 'en';
    onCapture: (file: File) => void;
    onCancel: () => void;
    side: 'front' | 'back' | 'selfie';
}

export default function LiveCapture({ onCapture, onCancel, side, locale = 'es' }: LiveCaptureProps) {
    const en = locale === 'en';
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        setError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: side === 'selfie' ? 'user' : 'environment' },
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play();
            }
        } catch (err: any) {
            setError('No se pudo acceder a la cámara. Revisa los permisos de tu navegador.');
            console.error(err);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setCapturedImage(dataUrl);
            stopCamera();
        }
    };

    const retake = () => {
        setCapturedImage(null);
        startCamera();
    };

    const confirmPhoto = () => {
        if (!capturedImage) return;
        setLoading(true);
        
        fetch(capturedImage)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], `capture_${side}_${Date.now()}.jpg`, { type: 'image/jpeg' });
                onCapture(file);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    const overlayType = side === 'selfie' ? 'oval' : 'rect';
    const instructions = side === 'front' ? 'Toma foto del frente de tu identificación' : 
                         side === 'back' ? 'Toma foto del reverso de tu identificación' : 
                         'Toma una selfie para verificar tu identidad';

    return (
        <div style={{ position: 'fixed', inset: 0, minHeight: '100dvh', background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 'calc(12px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 12px max(12px, env(safe-area-inset-left))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', zIndex: 10 }}>
                <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '10px' }}>{en ? 'Cancel' : 'Cancelar'}</button>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{side === 'front' ? 'Frente INE' : side === 'back' ? 'Reverso INE' : 'Selfie'}</span>
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
                        
                        {!capturedImage && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                                <div style={{ 
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    width: overlayType === 'rect' ? '80%' : '60%',
                                    height: overlayType === 'rect' ? '30%' : '50%',
                                    border: '2px solid rgba(255,255,255,0.7)',
                                    borderRadius: overlayType === 'rect' ? '12px' : '50%',
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
