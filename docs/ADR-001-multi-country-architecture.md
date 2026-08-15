# ADR-001: Multi-Country Architecture Decision

## Status
Accepted

## Context
The NOVA MART storefront is currently targeted at India and displays INR. However, the existing backend logic contains Nepal-specific assumptions including NPR currency, IRD tax regime, eSewa/Khalti payment providers, and Kathmandu defaults.

Before implementing financial, payment, tax, or address interfaces, we must establish whether to:
1. Build for India-only launch
2. Build a multi-country platform
3. Build for Nepal launch

## Decision
**Build multi-country foundations with India as the initial tenant.**

### Rationale
1. **Future-proofing**: NOVA MART may expand to other markets. Building country-specific hardcoding now would require expensive refactoring later.
2. **Minimal additional complexity**: The added complexity of configuration-driven country settings is modest compared to the cost of future re-architecture.
3. **Clean separation**: Feature flags allow us to disable country-specific modules (e.g., IRD tax for Nepal) without code branches.
4. **Tenant isolation**: Multi-tenant architecture enables easier addition of new markets without code changes.

## Implementation

### Configuration Model
Each organization and store will have:
- `country_code`: ISO 3166-1 alpha-2 (e.g., "IN", "NP")
- `currency_code`: ISO 4217 alpha-3 (e.g., "INR", "NPR")
- `locale`: IETF BCP 47 language tag (e.g., "en-IN", "ne-NP")
- `timezone`: IANA timezone identifier (e.g., "Asia/Kolkata", "Asia/Kathmandu")
- `tax_regime`: Configurable tax system identifier (e.g., "GST", "IRD")
- `payment_providers`: JSON array of enabled payment methods (e.g., ["razorpay", "upi"], ["esewa", "khalti"])
- `address_format`: Country-specific address validation rules

### Initial Tenant Configuration
The first NOVA MART tenant will be configured as:
- Country: India (IN)
- Currency: INR
- Locale: en-IN
- Timezone: Asia/Kolkata
- Tax regime: GST
- Payment providers: Razorpay, UPI
- Nepal-specific modules: Feature-flagged disabled

### Feature Flag Strategy
Country-specific modules will be behind feature flags:
- `ENABLE_NEPAL_IRD_TAX`: Nepal IRD tax integration
- `ENABLE_ESEWA_PAYMENT`: eSewa payment provider
- `ENABLE_KHALTI_PAYMENT`: Khalti payment provider
- `ENABLE_NEPALESE_LOCALE`: Nepali language support

### UI Requirements
- No admin screen will hardcode currency symbols (₹, रू), tax labels (GST, IRD), or payment provider names
- All labels will be derived from configuration
- Currency formatting will use locale-aware number formatting
- Date/time display will respect store timezone

## Consequences

### Positive
- Easy to add new countries/regions
- Clean separation of concerns
- No technical debt from country-specific hardcoding
- Testable country-switching in development

### Negative
- Slightly more complex initial implementation
- Requires additional configuration management
- More database fields for country settings

### Mitigations
- Provide sensible defaults for India configuration
- Create configuration validation to prevent invalid country setups
- Document country configuration requirements clearly

## References
- NOVA MART Admin Implementation Plan, Section 3
- ISO 3166-1 Country Codes
- ISO 4217 Currency Codes
- IETF BCP 47 Language Tags
- IANA Timezone Database
