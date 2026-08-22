# Backend security requirements

The deployed API currently exposes `GET /api/addresses/customer/{customerId}`; no session-derived address-list route was found in the existing Flutter contract. The app never accepts a customer ID from user input and isolates this compatibility call in `CustomerRepository`, but this is not an authorization boundary.

The checked-out backend currently compares the path customer ID with the authenticated session and scopes get/update/delete queries by the session customer. These checks must be retained. A future `GET /api/customer/addresses` endpoint derived entirely from the session is preferred so the client never sends a customer ID at all. Every address list, create, update, set-default, and delete request must continue to reject cross-customer access, including when an address UUID is guessed directly.

The backend must also enforce stock and the maximum permitted item quantity; the Flutter limit is only a UX safeguard. Checkout must atomically enforce the idempotency key per customer and return the original order for a repeated key, including after a client timeout.

## Pickup checkout contract

The current `POST /api/checkout/cod` Zod schema requires delivery address, city, province, postal code, and country even when `delivery_type` is `PICKUP`. The corrected app intentionally omits these fields for pickup rather than inventing a customer address. The backend must make those fields conditionally required only for `DELIVERY`; for `PICKUP`, it should derive the pickup location from the authenticated cart/store. Until that schema is deployed, pickup order submission remains a backend compatibility blocker.
