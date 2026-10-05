Example bodies copied from Asaas's public API docs (https://docs.asaas.com/reference).
The contract tests compare the sandbox's responses against these shapes.
Update them from the docs when Asaas changes its API; never edit them to match the sandbox.

- `payment.json`: POST /v3/payments and GET /v3/payments/{id} (Criar nova cobrança)
- `customer.json`: POST /v3/customers (Criar novo cliente)
- `customer-list.json`: GET /v3/customers (Listar clientes)
- `pix-qr-code.json`: GET /v3/payments/{id}/pixQrCode (Obter QR Code para pagamentos via Pix)
- `payment-webhook.json`: payment event body (Webhook para cobranças)
- `error.json`: 4xx error envelope
