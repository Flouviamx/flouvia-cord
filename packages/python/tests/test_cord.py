import json
import unittest

from cord import Cord, CordError, WebhookSignatureError, construct_event, sign_payload


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        self.calls.append((method, url, dict(headers), body))
        status, payload, extra = self.responses.pop(0)
        return status, {"content-type": "application/json", **extra}, json.dumps(payload).encode()


class ClientTests(unittest.TestCase):
    def test_rejects_publishable_key(self):
        with self.assertRaises(ValueError):
            Cord("pk_live_x")

    def test_retries_mutation_with_same_idempotency_key(self):
        t = FakeTransport([(502, {"error": "x"}, {"retry-after": "0"}), (200, {"data": {"id": "q1", "folio": "COT-1"}}, {})])
        cord = Cord("sk_test_x", transport=t, max_retries=1)
        quote = cord.quotes.create(items=[{"descripcion": "X", "cantidad": 1, "precio_unitario": 1}])
        self.assertEqual(quote["folio"], "COT-1")
        keys = [c[2]["Idempotency-Key"] for c in t.calls]
        self.assertEqual(len(keys), 2)
        self.assertEqual(keys[0], keys[1])
        self.assertEqual(t.calls[0][2]["Cord-Version"], "2026-10-01")

    def test_error_carries_code_and_request_id(self):
        t = FakeTransport([(404, {"error": "No", "code": "not_found"}, {"cord-request-id": "req_9"})])
        with self.assertRaises(CordError) as ctx:
            Cord("sk_test_x", transport=t).quotes.retrieve("abc")
        self.assertEqual((ctx.exception.status, ctx.exception.code, ctx.exception.request_id), (404, "not_found", "req_9"))
        self.assertNotIn("Idempotency-Key", t.calls[0][2])

    def test_paginates_offset_and_cursor(self):
        t = FakeTransport([
            (200, {"data": [{"id": 1}, {"id": 2}], "meta": {"limit": 200, "offset": 0, "total": 3}}, {}),
            (200, {"data": [{"id": 3}], "meta": {"limit": 200, "offset": 2, "total": 3}}, {}),
            (200, {"data": [{"id": "a"}], "meta": {"next_cursor": "c1"}}, {}),
            (200, {"data": [{"id": "b"}], "meta": {"next_cursor": None}}, {}),
        ])
        cord = Cord("sk_test_x", transport=t)
        self.assertEqual([c["id"] for c in cord.clients.list_all()], [1, 2, 3])
        self.assertEqual([f["id"] for f in cord.invoices.list_all()], ["a", "b"])
        self.assertIn("cursor=c1", t.calls[3][1])

    def test_test_helpers_require_test_key(self):
        with self.assertRaises(ValueError):
            Cord("sk_live_x", transport=FakeTransport([])).test_helpers.trigger_webhook("quote.paid")


class WebhookTests(unittest.TestCase):
    secret = "whsec_test"
    body = json.dumps({"id": "evt_1", "event": "invoice.paid", "created_at": "x", "data": {"id": "i1"}})
    now = 1_790_000_000

    def test_valid_v1(self):
        headers = {"X-Cord-Signature-V1": sign_payload(self.body, self.secret, self.now)}
        self.assertEqual(construct_event(self.body, headers, self.secret, now=self.now)["event"], "invoice.paid")

    def test_rotation_accepts_any_matching_signature(self):
        good = sign_payload(self.body, self.secret, self.now).split(",")[1]
        headers = {"x-cord-signature-v1": f"t={self.now},v1={'0' * 64},{good}"}
        construct_event(self.body.encode(), headers, self.secret, now=self.now)

    def test_rejections(self):
        cases = {
            "timestamp_out_of_tolerance": {"x-cord-signature-v1": sign_payload(self.body, self.secret, self.now - 301)},
            "signature_mismatch": {"x-cord-signature-v1": sign_payload(self.body, "otro", self.now)},
            "invalid_signature_header": {"x-cord-signature-v1": "basura"},
            "missing_signature": {},
            "legacy_signature_rejected": {"x-cord-signature": "sha256=" + "a" * 64},
        }
        for code, headers in cases.items():
            with self.subTest(code=code), self.assertRaises(WebhookSignatureError) as ctx:
                construct_event(self.body, headers, self.secret, now=self.now)
            self.assertEqual(ctx.exception.code, code)

    def test_tampered_body(self):
        headers = {"x-cord-signature-v1": sign_payload(self.body, self.secret, self.now)}
        with self.assertRaises(WebhookSignatureError) as ctx:
            construct_event(self.body.replace("i1", "i2"), headers, self.secret, now=self.now)
        self.assertEqual(ctx.exception.code, "signature_mismatch")


if __name__ == "__main__":
    unittest.main()
