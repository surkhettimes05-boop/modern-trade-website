# Backend security requirements

The deployed API currently exposes `GET /api/addresses/customer/{customerId}`; no session-derived address-list route was found in the existing Flutter contract. The app never accepts a customer ID from user input and isolates this compatibility call in `CustomerRepository`, but this is not an authorization boundary.

The checked-out backend currently compares the path customer ID with the authenticated session and scopes get/update/delete queries by the session customer. These checks must be retained. A future `GET /api/customer/addresses` endpoint derived entirely from the session is preferred so the client never sends a customer ID at all. Every address list, create, update, set-default, and delete request must continue to reject cross-customer access, including when an address UUID is guessed directly.

The backend must also enforce stock and the maximum permitted item quantity; the Flutter limit is only a UX safeguard. Checkout must atomically enforce the idempotency key per customer and return the original order for a repeated key, including after a client timeout.

## Pickup checkout contract

The checked-in `POST /api/checkout/cod` contract now requires the Nepal delivery address fields only when `delivery_type` is `DELIVERY`. For `PICKUP`, the API rejects invented customer delivery fields and derives the pickup address from the selected published store. Keep the contract tests passing and deploy this backend revision before enabling pickup in production.
