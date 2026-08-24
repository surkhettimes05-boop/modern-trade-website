# NOVA MART Flutter app

Native Android/iOS customer app for the StoreSync Nepal pilot. This project is
isolated from the existing Next.js website and reuses the existing Fastify API.

## Implemented customer flow

- Nova Mart home, categories, live catalog, search, filters and sorting
- Product details, store selection and persistent local cart
- Nepal mobile OTP authentication with secure session/CSRF storage
- Delivery or pickup and cash-on-delivery checkout
- Server-side cart creation, price/stock validation and idempotent order creation
- Customer order history, saved addresses and loyalty summary/history
- Help/FAQ, privacy and terms screens
- Responsive phone/tablet product grids and an explicit offline catalog preview

The admin, staff, POS and operations products remain web-only.

## API configuration

The committed default points to the deployed Render backend:

```text
https://storesync-backend-dg8z.onrender.com
```

Override it for local development at run or build time:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3001
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com
```

Use HTTPS for every production build. A physical phone must use a network URL
that can reach the backend; `localhost` on the phone is the phone itself.

## Run locally

Start the existing backend first, following the repository root README. Then:

```powershell
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

### Browser preview

Build and serve the Flutter app locally:

```powershell
flutter build web --release --dart-define=API_BASE_URL=http://127.0.0.1:3001
py -3 -m http.server 52123 --bind 127.0.0.1 --directory build\web
```

Then open `http://127.0.0.1:52123`. If the backend is not running, the app
shows its labelled offline opening-range preview; checkout requires the live API.

The app shows a small, clearly labelled opening-range preview if the live API is
not reachable. Checkout is intentionally unavailable for preview-only products.

## Authentication compatibility

The existing browser-compatible `customer_session` and `customer_csrf` cookies
are captured from OTP verification, stored with `flutter_secure_storage`, and
sent with protected API requests. No backend or website changes are required.

## Release checklist

1. Confirm the NOVA MART launcher icon is approved for Android, iOS, and web.
2. Set final Android application ID and Apple bundle ID if they differ from
   `com.novamart.modern_trade_flutter`.
3. Configure the production HTTPS API URL with `--dart-define`.
4. Provide support and policy values through Dart defines (contact is hidden if unset).
5. Confirm store listing privacy disclosures and screenshots.
6. Run `flutter analyze`, `flutter test`, and physical-device checkout tests.
7. Build a signed Android App Bundle and iOS archive.

### Required release configuration

Codemagic expects a secured `nova_mart_android_signing` variable group containing
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
`ANDROID_KEY_PASSWORD`. Set `API_BASE_URL` to the production HTTPS API. Optional
`SUPPORT_PHONE`, `PRIVACY_POLICY_URL`, and `TERMS_URL` values control the support
and external policy actions. No signing value belongs in source control.

Prices are parsed from numeric or string API values and totals use integer paisa
internally. This supports decimal prices while avoiding floating-point total drift.
The API remains authoritative for price, stock, and quantity validation.

## Important pilot constraints

- Active country: Nepal (`NP`)
- Currency: Nepalese rupee (`NPR`)
- Customer phones: Nepal mobile numbers
- Certified checkout: cash on delivery / cash at pickup
- eSewa, Khalti, Fonepay and card payments remain excluded until the backend
  integrations are production-certified.
