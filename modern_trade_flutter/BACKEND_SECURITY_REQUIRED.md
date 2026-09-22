# Backend security requirements

The canonical address-list contract is now `GET /api/customer/addresses`, which
derives ownership entirely from the authenticated session. The former
`GET /api/addresses/customer/{customerId}` route remains temporarily for older
clients and must be removed after the supported-client migration window.

Every address list, create, update, set-default, and delete request must continue
to reject cross-customer access, including when an address UUID is guessed
directly. Never reintroduce client-supplied ownership into the canonical route.

The backend must also enforce stock and the maximum permitted item quantity; the Flutter limit is only a UX safeguard. Checkout must atomically enforce the idempotency key per customer and return the original order for a repeated key, including after a client timeout.

## Pickup checkout contract

The checked-in `POST /api/checkout/cod` contract now requires the Nepal delivery address fields only when `delivery_type` is `DELIVERY`. For `PICKUP`, the API rejects invented customer delivery fields and derives the pickup address from the selected published store. Keep the contract tests passing and deploy this backend revision before enabling pickup in production.
