# Security policy

Report suspected vulnerabilities privately to the NOVA MART security owner. Do
not include customer personal data, active credentials, OTPs, session cookies,
or production database extracts in a report.

The security owner must acknowledge a report within two business days, assign
severity using CVSS plus business impact, and coordinate remediation and safe
disclosure. Critical production issues require immediate credential rotation,
containment, evidence preservation, and incident-response escalation.

Supported releases are the current production version and the immediately
preceding version while a forced upgrade is being rolled out.

## Repository rules

- Never commit `.env`, keystores, signing passwords, tokens, or credentials.
- Use protected CI environments for production signing.
- Treat telemetry, screenshots, logs, and test fixtures as potentially
  sensitive.
- Retain obfuscation symbols in restricted build storage for crash decoding.
- Changes affecting authentication, authorization, checkout, storage, or
  cryptography require security review.
