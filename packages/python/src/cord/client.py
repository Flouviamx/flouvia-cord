"""Cliente de la API v1 de Cord. Cada método corresponde a una ruta de la spec OpenAPI."""
from __future__ import annotations

from typing import Any, Dict, Iterator, List, Optional
from urllib.parse import quote

from ._http import API_VERSION, HttpClient, Transport
from . import webhooks as _webhooks

Obj = Dict[str, Any]


def _q(value: str) -> str:
    return quote(str(value), safe="")


class _Resource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def _get(self, path: str, **query: Any) -> Any:
        return self._http.request("GET", path, query=query)[0]

    def _page(self, path: str, **query: Any) -> Obj:
        data, meta = self._http.request("GET", path, query=query)
        return {"data": data or [], "meta": meta or {}}

    def _post(self, path: str, body: Any, idempotency_key: Optional[str] = None) -> Any:
        return self._http.request("POST", path, body=body, idempotency_key=idempotency_key)[0]

    def _offset_all(self, path: str, **query: Any) -> Iterator[Obj]:
        offset = 0
        while True:
            page = self._page(path, limit=200, offset=offset, **query)
            items = page["data"]
            yield from items
            offset += len(items)
            if not items or offset >= int(page["meta"].get("total", 0)):
                return

    def _cursor_all(self, path: str, **query: Any) -> Iterator[Obj]:
        cursor = None
        while True:
            page = self._page(path, limit=200, cursor=cursor, **query)
            yield from page["data"]
            cursor = page["meta"].get("next_cursor")
            if not cursor:
                return


class Quotes(_Resource):
    def list(self, **params: Any) -> Obj:
        return self._page("/cotizaciones", **params)

    def list_all(self, **params: Any) -> Iterator[Obj]:
        return self._offset_all("/cotizaciones", **params)

    def retrieve(self, quote_id: str) -> Obj:
        return self._get(f"/cotizaciones/{_q(quote_id)}")

    def create(self, idempotency_key: Optional[str] = None, **params: Any) -> Obj:
        return self._post("/cotizaciones", params, idempotency_key)

    def _action(self, quote_id: str, action: str, idempotency_key: Optional[str] = None, **extra: Any) -> Obj:
        return self._post(f"/cotizaciones/{_q(quote_id)}", {"action": action, **extra}, idempotency_key)

    def send(self, quote_id: str, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(quote_id, "send", idempotency_key)

    def resend(self, quote_id: str, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(quote_id, "resend", idempotency_key)

    def approve(self, quote_id: str, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(quote_id, "approve", idempotency_key)

    def reject(self, quote_id: str, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(quote_id, "reject", idempotency_key)

    def mark_paid(self, quote_id: str, payment_method: Optional[str] = None, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(quote_id, "mark_paid", idempotency_key, payment_method=payment_method)

    def delete(self, quote_id: str) -> Obj:
        return self._http.request("DELETE", f"/cotizaciones/{_q(quote_id)}")[0]

    def draft_from_text(self, texto: str) -> Obj:
        return self._post("/cotizaciones/ia", {"texto": texto})


class Clients(_Resource):
    def list(self, **params: Any) -> Obj:
        return self._page("/clientes", **params)

    def list_all(self, **params: Any) -> Iterator[Obj]:
        return self._offset_all("/clientes", **params)

    def retrieve(self, client_id: str) -> Obj:
        return self._get(f"/clientes/{_q(client_id)}")

    def create(self, idempotency_key: Optional[str] = None, **params: Any) -> Obj:
        return self._post("/clientes", params, idempotency_key)

    def update(self, client_id: str, idempotency_key: Optional[str] = None, **params: Any) -> Obj:
        return self._http.request("PATCH", f"/clientes/{_q(client_id)}", body=params, idempotency_key=idempotency_key)[0]


class Products(_Resource):
    def list(self, **params: Any) -> Obj:
        return self._page("/productos", **params)

    def list_all(self) -> Iterator[Obj]:
        return self._offset_all("/productos")

    def create(self, idempotency_key: Optional[str] = None, **params: Any) -> Obj:
        return self._post("/productos", params, idempotency_key)


class Invoices(_Resource):
    def list(self, **params: Any) -> Obj:
        return self._page("/facturas", **params)

    def list_all(self, **params: Any) -> Iterator[Obj]:
        return self._cursor_all("/facturas", **params)

    def retrieve(self, invoice_id: str) -> Obj:
        return self._get(f"/facturas/{_q(invoice_id)}")

    def create(self, idempotency_key: Optional[str] = None, **params: Any) -> Obj:
        """Crea un BORRADOR; emitirlo es `finalize`."""
        return self._post("/facturas", params, idempotency_key)

    def _action(self, invoice_id: str, action: str, idempotency_key: Optional[str] = None, **extra: Any) -> Obj:
        body = {"action": action, **{k: v for k, v in extra.items() if v is not None}}
        return self._post(f"/facturas/{_q(invoice_id)}", body, idempotency_key)

    def finalize(self, invoice_id: str, idempotency_key: Optional[str] = None) -> Obj:
        """Emite la factura. Irreversible y consume medidor."""
        return self._action(invoice_id, "finalize", idempotency_key)

    def send(self, invoice_id: str, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(invoice_id, "send", idempotency_key)

    def void(self, invoice_id: str, motivo: Optional[str] = None, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(invoice_id, "void", idempotency_key, motivo=motivo)

    def record_payment(self, invoice_id: str, monto: float, moneda: str, metodo: Optional[str] = None, referencia: Optional[str] = None, idempotency_key: Optional[str] = None) -> Obj:
        """Importe y divisa siempre juntos."""
        return self._action(invoice_id, "payment", idempotency_key, monto=monto, moneda=moneda, metodo=metodo, referencia=referencia)

    def credit_note(self, invoice_id: str, monto: Optional[float] = None, motivo: Optional[str] = None, idempotency_key: Optional[str] = None) -> Obj:
        return self._action(invoice_id, "credit_note", idempotency_key, monto=monto, motivo=motivo)


class Events(_Resource):
    def list(self, **params: Any) -> Obj:
        return self._page("/events", **params)

    def list_all(self, **params: Any) -> Iterator[Obj]:
        return self._cursor_all("/events", **params)


class WebhookEndpoints(_Resource):
    def list(self) -> List[Obj]:
        return self._get("/webhooks")

    def create(self, url: str, eventos: Optional[List[str]] = None) -> Obj:
        """Devuelve el `secret` una sola vez."""
        return self._post("/webhooks", {"url": url, **({"eventos": eventos} if eventos else {})})

    def delete(self, endpoint_id: str) -> Obj:
        return self._http.request("DELETE", f"/webhooks/{_q(endpoint_id)}")[0]


class TestHelpers(_Resource):
    """Simuladores del modo prueba. Solo con una llave sk_test_."""

    def _check(self) -> None:
        if self._http.mode != "test":
            raise ValueError("test_helpers solo funciona con una llave de prueba (sk_test_).")

    def set_next_fiscal_outcome(self, resultado: str) -> Obj:
        self._check()
        return self._post("/test_helpers/fiscal", {"siguiente_resultado": resultado})

    def view_quote(self, quote_id: str) -> Obj:
        self._check()
        return self._post(f"/test_helpers/cotizaciones/{_q(quote_id)}", {"accion": "vista"})

    def expire_quote(self, quote_id: str) -> Obj:
        self._check()
        return self._post(f"/test_helpers/cotizaciones/{_q(quote_id)}", {"accion": "vencer"})

    def trigger_webhook(self, evento: str, objeto_id: Optional[str] = None) -> Obj:
        self._check()
        return self._post("/test_helpers/webhooks", {"evento": evento, **({"objeto_id": objeto_id} if objeto_id else {})})


class _Webhooks:
    construct_event = staticmethod(_webhooks.construct_event)
    sign_payload = staticmethod(_webhooks.sign_payload)


class Cord:
    """
    >>> cord = Cord("sk_test_...")
    >>> quote = cord.quotes.create(cliente={"empresa": "Acme"}, items=[{"descripcion": "X", "cantidad": 1, "precio_unitario": 100}])
    """

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
        http = HttpClient(api_key, base_url=base_url, api_version=api_version, timeout=timeout, max_retries=max_retries, transport=transport)
        self._http = http
        self.mode = http.mode
        self.quotes = Quotes(http)
        self.clients = Clients(http)
        self.products = Products(http)
        self.invoices = Invoices(http)
        self.events = Events(http)
        self.webhook_endpoints = WebhookEndpoints(http)
        self.test_helpers = TestHelpers(http)
        self.webhooks = _Webhooks()

    def me(self) -> Obj:
        return self._http.request("GET", "/me")[0]

    def collections(self) -> Obj:
        return self._http.request("GET", "/cobranza")[0]

    def elements_config(self) -> Obj:
        return self._http.request("GET", "/elements/config")[0]

    def create_task(self, titulo: str, due_date: Optional[str] = None, cotizacion_id: Optional[str] = None) -> Obj:
        body = {"titulo": titulo, **({"due_date": due_date} if due_date else {}), **({"cotizacion_id": cotizacion_id} if cotizacion_id else {})}
        return self._http.request("POST", "/tareas", body=body)[0]
