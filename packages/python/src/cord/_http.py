"""Transporte HTTP: autenticación, Cord-Version, idempotencia, reintentos y errores tipados."""
from __future__ import annotations

import json
import random
import time
import uuid
from typing import Any, Callable, Dict, Mapping, Optional, Tuple
from urllib import error as urlerror
from urllib import parse, request

API_VERSION = "2026-10-01"
SDK_VERSION = "1.0.0"
_RETRYABLE = {408, 425, 429, 500, 502, 503, 504}

Transport = Callable[[str, str, Dict[str, str], Optional[bytes], float], Tuple[int, Dict[str, str], bytes]]


class CordError(Exception):
    """Error de la API. Incluye `code` estable, `request_id` para soporte y `doc_url`."""

    def __init__(self, status: int, body: Any, request_id: Optional[str] = None) -> None:
        body = body if isinstance(body, dict) else {}
        super().__init__(body.get("error") or f"Cord API error ({status})")
        self.status = status
        self.code: str = body.get("code") or ("network_error" if status == 0 else "unknown")
        self.request_id: Optional[str] = request_id or body.get("request_id")
        self.doc_url: Optional[str] = body.get("doc_url")
        self.body = body


def _urllib_transport(method: str, url: str, headers: Dict[str, str], body: Optional[bytes], timeout: float):
    req = request.Request(url, data=body, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=timeout) as res:  # noqa: S310 (URL fija de Cord)
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
    except urlerror.HTTPError as exc:
        return exc.code, {k.lower(): v for k, v in (exc.headers or {}).items()}, exc.read() or b""


class HttpClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://cordhq.app",
        api_version: str = API_VERSION,
        timeout: float = 30.0,
        max_retries: int = 2,
        transport: Optional[Transport] = None,
    ) -> None:
        if not api_key or not isinstance(api_key, str):
            raise ValueError("Falta la API key (sk_live_…, sk_test_… o una restringida rk_…).")
        if api_key.startswith("pk_"):
            raise ValueError("El SDK de servidor usa una secret key (sk_ o rk_). La pk_ es para el navegador.")
        self._api_key = api_key
        self.mode = "test" if api_key.startswith(("sk_test_", "rk_test_")) else "live"
        self.api_version = api_version
        self._base = base_url.rstrip("/") + "/api/v1"
        self._timeout = timeout
        self._max_retries = max(0, min(5, max_retries))
        self._transport = transport or _urllib_transport

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        idempotency_key: Optional[str] = None,
    ) -> Tuple[Any, Optional[Dict[str, Any]]]:
        url = self._base + path
        clean = {k: v for k, v in (query or {}).items() if v not in (None, "")}
        if clean:
            url += "?" + parse.urlencode(clean)
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "Cord-Version": self.api_version,
            "User-Agent": f"cord-python/{SDK_VERSION}",
        }
        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body).encode("utf-8")
        # Toda mutación lleva clave, la misma en cada reintento: nunca duplica.
        if method != "GET":
            headers["Idempotency-Key"] = idempotency_key or str(uuid.uuid4())

        attempt = 0
        while True:
            try:
                status, res_headers, raw = self._transport(method, url, headers, payload, self._timeout)
            except Exception as exc:  # red caída o timeout
                if attempt < self._max_retries:
                    time.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise CordError(0, {"error": f"No se pudo contactar a Cord: {exc}"}) from exc
            try:
                parsed = json.loads(raw.decode("utf-8")) if raw else {}
            except ValueError:
                parsed = {"error": raw[:200].decode("utf-8", "replace")}
            request_id = res_headers.get("cord-request-id")
            if 200 <= status < 300:
                return parsed.get("data"), parsed.get("meta")
            retryable = status in _RETRYABLE or (status == 409 and parsed.get("code") == "idempotency_in_progress")
            if retryable and attempt < self._max_retries:
                wait = _retry_after(res_headers.get("retry-after")) or _backoff(attempt)
                time.sleep(wait)
                attempt += 1
                continue
            raise CordError(status, parsed, request_id)


def _backoff(attempt: int) -> float:
    base = min(10.0, 0.5 * (2 ** attempt))
    return base / 2 + random.random() * base / 2


def _retry_after(value: Optional[str]) -> Optional[float]:
    try:
        seconds = float(value) if value else 0.0
    except ValueError:
        return None
    return min(seconds, 60.0) if seconds > 0 else None
