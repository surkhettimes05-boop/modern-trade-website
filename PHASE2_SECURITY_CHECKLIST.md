# Phase 2 Security and Privacy Testing Checklist

## Overview
This document outlines the security and privacy testing requirements for Phase 2 of the StoreSync platform.

## Authentication & Authorization

### OTP Authentication
- [ ] Test OTP brute force protection (max 3 attempts)
- [ ] Test OTP resend rate limiting (1 minute cooldown, 5 per hour)
- [ ] Test OTP expiry (5 minutes)
- [ ] Test OTP enumeration resistance (consistent error messages)
- [ ] Test session token security (secure storage, expiration)
- [ ] Test session invalidation on logout
- [ ] Test multi-device session management
- [ ] Test session revocation by admin

### Phone Number Security
- [ ] Verify phone normalization handles all valid formats
- [ ] Verify phone hashing is consistent and secure (SHA-256)
- [ ] Verify phone masking for staff views (98XXXXXX)
- [ ] Test phone number enumeration prevention
- [ ] Verify encrypted phone storage (if implemented)

## Data Privacy

### Customer Data
- [ ] Verify phone numbers are hashed for lookup
- [ ] Verify phone numbers are masked in staff views
- [ ] Test consent grant/withdraw functionality
- [ ] Test consent state transitions
- [ ] Verify consent audit trail
- [ ] Test data access requests
- [ ] Test data deletion requests
- [ ] Test data correction requests
- [ ] Verify communication suppression on consent withdrawal

### Audit Logging
- [ ] Verify all customer data changes are logged
- [ ] Verify consent changes are logged
- [ ] Verify ledger entries are logged
- [ ] Verify audit log includes actor, timestamp, IP
- [ ] Test audit log immutability

## API Security

### Input Validation
- [ ] Test SQL injection prevention on all endpoints
- [ ] Test XSS prevention on all string inputs
- [ ] Test CSRF protection (if using cookies)
- [ ] Test parameter tampering
- [ ] Test mass assignment prevention

### Rate Limiting
- [ ] Test rate limiting on OTP endpoints
- [ ] Test rate limiting on public endpoints
- [ ] Test rate limiting on admin endpoints
- [ ] Verify rate limit headers are present

### CORS Configuration
- [ ] Verify CORS only allows trusted origins
- [ ] Test CORS preflight handling
- [ ] Verify credentials handling

### Error Handling
- [ ] Verify error messages don't leak sensitive information
- [ ] Test error handling for database failures
- [ ] Test error handling for validation failures
- [ ] Verify stack traces are not exposed in production

## Ledger Security

### Immutability
- [ ] Verify ledger entries cannot be modified
- [ ] Verify ledger entries cannot be deleted
- [ ] Test reversal chain integrity
- [ ] Verify idempotency key enforcement

### Balance Calculation
- [ ] Verify balance calculation is always from ledger
- [ ] Test balance reconciliation
- [ ] Verify no cached balance manipulation
- [ ] Test balance calculation accuracy

### Earn Lots
- [ ] Verify FIFO deduction for redemptions
- [ ] Test point restoration for reversals
- [ ] Verify expiry processing
- [ ] Test earn lot integrity

## POS Integration Security

### Sale Creation
- [ ] Test idempotency key enforcement
- [ ] Verify sale status transitions are valid
- [ ] Test customer attachment validation
- [ ] Verify sale total validation

### Earn Posting
- [ ] Test earn posting only on COMPLETED sales
- [ ] Verify earn posting idempotency
- [ ] Test earn lot creation
- [ ] Verify ledger entry creation

### Redemption
- [ ] Test redemption authorization (balance check)
- [ ] Verify redemption cannot exceed balance
- [ ] Test FIFO deduction
- [ ] Verify redemption idempotency

### Void & Return
- [ ] Test void reversal of earn points
- [ ] Test void reversal of redemption
- [ ] Verify void status validation
- [ ] Test return proportional reversal
- [ ] Verify return idempotency

## Offline Queue Security

### Queue Management
- [ ] Test queue entry creation validation
- [ ] Verify sync retry limits
- [ ] Test queue status transitions
- [ ] Verify device isolation

### Sync Process
- [ ] Test sync idempotency
- [ ] Verify sale creation during sync
- [ ] Test earn posting during sync
- [ ] Verify error handling during sync

## Web Application Security

### Client-Side Security
- [ ] Verify session token storage (localStorage vs httpOnly cookie)
- [ ] Test XSS prevention in React components
- [ ] Verify input sanitization
- [ ] Test CSRF protection (if applicable)

### API Communication
- [ ] Verify HTTPS enforcement in production
- [ ] Test API error handling
- [ ] Verify sensitive data not exposed in client
- [ ] Test logout functionality

## Database Security

### Access Control
- [ ] Verify database user permissions are minimal
- [ ] Test connection string security
- [ ] Verify no hardcoded credentials
- [ ] Test database connection pooling security

### Query Security
- [ ] Verify parameterized queries everywhere
- [ ] Test SQL injection prevention
- [ ] Verify no dynamic SQL construction
- [ ] Test query result limits

## Infrastructure Security

### Environment Variables
- [ ] Verify all secrets use environment variables
- [ ] Test .env file is in .gitignore
- [ ] Verify no hardcoded secrets in code
- [ ] Test environment variable validation

### Dependencies
- [ ] Run `npm audit` on backend
- [ ] Run `npm audit` on frontend
- [ ] Review high/critical vulnerabilities
- [ ] Update vulnerable dependencies

### Deployment
- [ ] Verify Docker images use non-root user
- [ ] Test Docker security scanning
- [ ] Verify minimal base images
- [ ] Test container isolation

## Privacy Compliance

### GDPR Requirements
- [ ] Verify right to access is implemented
- [ ] Verify right to deletion is implemented
- [ ] Verify right to correction is implemented
- [ ] Test consent management
- [ ] Verify data portability (if required)

### Data Retention
- [ ] Verify OTP cleanup job
- [ ] Verify session cleanup job
- [ ] Test audit log retention policy
- [ ] Verify offline queue cleanup

### Data Minimization
- [ ] Verify only necessary data is collected
- [ ] Test data collection at enrollment
- [ ] Verify no unnecessary data in API responses
- [ ] Test data exposure in logs

## Performance & Availability

### Rate Limiting
- [ ] Test rate limiting effectiveness
- [ ] Verify rate limits don't block legitimate users
- [ ] Test rate limit recovery

### Error Handling
- [ ] Test graceful degradation
- [ ] Verify database failure handling
- [ ] Test external service failure handling
- [ ] Verify no cascading failures

## Testing Tools

### Recommended Tools
- **OWASP ZAP**: Web application security scanner
- **SQLMap**: SQL injection testing
- **Burp Suite**: Web security testing
- **npm audit**: Dependency vulnerability scanning
- **Snyk**: Dependency and code security scanning
- **SonarQube**: Code quality and security analysis

### Manual Testing Checklist
- [ ] Penetration testing by security professional
- [ ] Code review by security professional
- [ ] Privacy impact assessment
- [ ] Threat modeling
- [ ] Security architecture review

## Documentation

- [ ] Document security architecture
- [ ] Document data flow diagrams
- [ ] Document incident response plan
- [ ] Document privacy policy
- [ ] Document cookie policy

## Sign-off

- **Security Review**: _______________ Date: _______
- **Privacy Review**: _______________ Date: _______
- **Compliance Review**: _____________ Date: _______
