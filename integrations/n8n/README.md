# n8n-nodes-cord

The [Cord](https://cordhq.app) node for n8n. Cord takes a sale from proposal to payment in a single link: quotes, clients, invoices and payments.

## Installation

On self-hosted n8n, open **Settings › Community Nodes › Install** and enter `n8n-nodes-cord`.

## Credentials

The node uses a **Cord API** credential with a secret API key.

1. In Cord, turn on **Developer mode** at the bottom of the Settings index.
2. Open the **API** tab and create a **secret key** with write access.
3. Paste it in the Cord API credential in n8n. Keys that start with `sk_test_` work with your Cord test environment.

## Nodes

- **Cord Trigger** starts a workflow when something happens in Cord: a quote is sent, opened, approved or paid, an invoice is paid, a client is created, and more. It registers its own webhook in Cord when the workflow is activated, removes it when it is deactivated, and verifies the `X-Cord-Signature-V1` signature on every delivery.
- **Cord** works with Cord data:
  - Clients: create, update, get and search.
  - Quotes: create, get, search, send and mark as paid.
  - Tasks: create.

## Compatibility

Requires n8n 1.x and Node.js 20 or later.

## Resources

- [Connect Cord with n8n](https://cordhq.app/en/support/conectar-n8n)
- [Cord API documentation](https://cordhq.app/en/docs)

## License

[MIT](LICENSE)
