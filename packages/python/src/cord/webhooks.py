"""Verificación de webhooks de Cord.

Exige X-Cord-Signature-V1 (con timestamp): sin él cualquier entrega capturada se
podría reenviar para siempre. La firma legacy sin timestamp solo se acepta si la
pides con ``allow_legacy_signature=True``.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any, Dict, Mapping, Optional, Union

_HEX64 = re.compile(r"^[0-9a-f]{64}$")


class WebhookSignatureError(Exception):
    """La entrega no es auténtica. `code` dice por qué."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _header(headers: Mapping[str, Any], name: str) -> Optional[str]:
    for key, value in headers.items():
        if key.lower() == name:
            if isinstance(value, (list, tuple)):
                return str(value[0]) if value else None
            return str(value)
    return None


def _sign(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def construct_event(
    payload: Union[str, bytes],
    headers: Mapping[str, Any],
    secret: str,
    *,
    tolerance: int = 300,
    allow_legacy_signature: bool = False,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """Verifica y decodifica una entrega. `payload` es el cuerpo CRUDO."""
    if not secret:
        raise WebhookSignatureError("missing_signature", "Falta el secreto del endpoint.")
    body = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    current = int(time.time()) if now is None else now
    v1 = _header(headers, "x-cord-signature-v1")

    if v1:
        timestamp = None
        signatures = []
        for part in v1.split(","):
            key, _, value = part.strip().partition("=")
            if key == "t" and value.isdigit() and len(value) <= 12:
                timestamp = int(value)
            elif key == "v1" and _HEX64.match(value.lower()):
                signatures.append(value.lower())
        if timestamp is None or not signatures:
            raise WebhookSignatureError("invalid_signature_header", "X-Cord-Signature-V1 no tiene el formato t=<unix>,v1=<hex>.")
        if abs(current - timestamp) > tolerance:
            raise WebhookSignatureError("timestamp_out_of_tolerance", "La firma está fuera de la ventana de tolerancia: posible reenvío.")
        expected = _sign(secret, f"{timestamp}.{body}")
        # Durante una rotación de secreto llegan dos v1: basta con que uno cuadre.
        if not any(hmac.compare_digest(expected, sig) for sig in signatures):
            raise WebhookSignatureError("signature_mismatch", "La firma no corresponde a este secreto.")
        return _parse(body)

    legacy = _header(headers, "x-cord-signature")
    if not legacy:
        raise WebhookSignatureError("missing_signature", "La entrega no trae firma de Cord.")
    if not allow_legacy_signature:
        raise WebhookSignatureError("legacy_signature_rejected", "Solo llegó la firma legacy (sin timestamp). Usa allow_legacy_signature=True si de verdad la necesitas.")
    sig = legacy.strip().lower().removeprefix("sha256=")
    if not _HEX64.match(sig):
        raise WebhookSignatureError("invalid_signature_header", "X-Cord-Signature no tiene el formato sha256=<hex>.")
    if not hmac.compare_digest(_sign(secret, body), sig):
        raise WebhookSignatureError("signature_mismatch", "La firma no corresponde a este secreto.")
    return _parse(body)


def sign_payload(payload: str, secret: str, timestamp: Optional[int] = None) -> str:
    """Firma un cuerpo como lo hace Cord. Útil en tus pruebas."""
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={_sign(secret, f'{ts}.{payload}')}"


def _parse(body: str) -> Dict[str, Any]:
    try:
        event = json.loads(body)
    except ValueError as exc:
        raise WebhookSignatureError("invalid_payload", "El cuerpo no es JSON válido.") from exc
    if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not isinstance(event.get("event"), str) or not isinstance(event.get("data"), dict):
        raise WebhookSignatureError("invalid_payload", "El cuerpo no tiene la forma { id, event, created_at, data }.")
    return event
