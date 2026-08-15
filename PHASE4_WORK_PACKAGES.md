# Phase 4 Work Packages

## Overview
This document defines the work packages for Phase 4, including dependencies, estimates, owners, and acceptance gates.

## Work Package 1: Networking

### Owner
Infrastructure Team / Network Engineer

### Dependencies
- None (can start immediately)

### Estimate
- Design: 3 days
- Implementation per store: 2 days
- Testing per store: 1 day
- Total for 5 stores: 3 + (2+1)*5 = 18 days

### Tasks

#### 1.1 Network Design
- [ ] Device inventory template
- [ ] ISP details template
- [ ] IP addressing plan
- [ ] VLAN design (POS, Staff, Guest, CCTV/IoT, Management)
- [ ] Firewall rules matrix
- [ ] Wi-Fi design
- [ ] Remote access design (VPN/MFA)
- [ ] Monitoring design

#### 1.2 Per-Store Implementation
- [ ] Device inventory capture
- [ ] ISP configuration
- [ ] VLAN configuration
- [ ] Firewall rules deployment
- [ ] Wi-Fi setup
- [ ] Cable/port labeling
- [ ] Remote access setup
- [ ] Configuration backup
- [ ] Primary WAN setup
- [ ] Backup WAN setup
- [ ] UPS setup and runtime test

#### 1.3 Testing
- [ ] Guest isolation test
- [ ] CCTV/IoT isolation test
- [ ] Management interface isolation test
- [ ] WAN failover test
- [ ] ISP recovery test
- [ ] Replacement router recovery test
- [ ] Configuration restoration test
- [ ] UPS runtime test
- [ ] Safe restart test
- [ ] StoreSync reconnection test

### Acceptance Gate
- [ ] All VLANs isolated and tested
- [ ] No device management ports exposed to internet
- [ ] WAN failover works automatically
- [ ] Configuration backups verified
- [ ] UPS runtime meets requirements
- [ ] StoreSync reconnects after network recovery
- [ ] Network diagrams documented
- [ ] Device inventory complete

### Deliverables
- Network design document
- Per-store network configuration
- Network diagrams
- Device inventory
- Firewall rules matrix
- Configuration backup procedures
- Network runbook

---

## Work Package 2: Offline Synchronization

### Owner
Backend Developer

### Dependencies
- None (can start immediately)

### Estimate
- Design: 3 days
- Implementation: 10 days
- Testing: 5 days
- Documentation: 2 days
- Total: 20 days

### Tasks

#### 2.1 Local Transaction Queue
- [ ] Extend queue to support all transaction types (sales, returns, payments)
- [ ] Add globally unique identifiers (UUID v4)
- [ ] Add device identity management
- [ ] Add local sequence numbers
- [ ] Add original occurrence timestamps
- [ ] Add reference data versioning
- [ ] Add checksums/signatures

#### 2.2 Synchronization Protocol
- [ ] Implement batched encrypted sync
- [ ] Add retry with exponential backoff
- [ ] Add durable server acknowledgement
- [ ] Add idempotent replay protection
- [ ] Add rejected record queue
- [ ] Add conflict detection and resolution
- [ ] Add clock drift monitoring

#### 2.3 UI States
- [ ] Online state indicators
- [ ] Degraded mode UI
- [ ] Offline mode UI
- [ ] Last-sync status display
- [ ] Queue depth display
- [ ] Queue age display
- [ ] Sync progress indicators

#### 2.4 Recovery
- [ ] Recovery runbook
- [ ] Manual sync trigger
- [ ] Conflict resolution UI
- [ ] Data repair tools

#### 2.5 Testing
- [ ] Sudden disconnect test
- [ ] Long outage test (24+ hours)
- [ ] Duplicate upload test
- [ ] Out-of-order upload test
- [ ] Power failure test
- [ ] Clock drift test
- [ ] Corrupted cache test
- [ ] Full storage test
- [ ] Server rejection test
- [ ] Device replacement test
- [ ] Primary/backup WAN transition test

### Acceptance Gate
- [ ] No transaction silently discarded
- [ ] All transaction types supported offline
- [ ] Duplicate uploads handled correctly
- [ ] Out-of-order uploads handled correctly
- [ ] Conflicts detected and resolved
- [ ] Clock drift monitored and corrected
- [ ] UI clearly shows sync state
- [ ] Recovery procedures documented
- [ ] All tests pass

### Deliverables
- Extended offline queue schema
- Synchronization service
- UI components for sync state
- Recovery runbook
- Test results
- API documentation

---

## Work Package 3: Operational Modules

### Owner
Backend Developer + Frontend Developer

### Dependencies
- Work Package 2 (Offline Sync) - for inventory operations
- Work Package 4 (Payments) - for tender reconciliation

### Estimate
- Design: 5 days
- Backend implementation: 15 days
- Frontend implementation: 10 days
- Testing: 5 days
- Documentation: 3 days
- Total: 38 days

### Tasks

#### 3.1 Supplier Management
- [ ] Supplier profiles schema
- [ ] Supplier CRUD API
- [ ] Supplier list UI
- [ ] Supplier detail UI
- [ ] Supplier approval workflow

#### 3.2 Purchasing
- [ ] Purchase order schema
- [ ] PO creation API
- [ ] PO approval workflow
- [ ] PO tracking API
- [ ] PO list UI
- [ ] PO detail UI
- [ ] PO approval UI

#### 3.3 Receiving
- [ ] Receiving schema
- [ ] Receive against PO API
- [ ] Quantity verification
- [ ] Quality check workflow
- [ ] Batch/lot capture
- [ ] Expiry date capture
- [ ] Discrepancy handling
- [ ] Receiving UI

#### 3.4 Batch and Expiry
- [ ] Enhance batch_inventory with workflow
- [ ] Batch tracking API
- [ ] Expiry monitoring alerts
- [ ] FIFO picking logic
- [ ] Batch reconciliation
- [ ] Batch management UI
- [ ] Expiry report UI

#### 3.5 Warehouse Transfers
- [ ] Transfer request workflow
- [ ] Transfer approval workflow
- [ ] Picking and dispatch
- [ ] Receipt verification
- [ ] Transfer reconciliation
- [ ] Transfer list UI
- [ ] Transfer detail UI
- [ ] Picking UI
- [ ] Receipt UI

#### 3.6 Store Replenishment
- [ ] Replenishment request schema
- [ ] Replenishment API
- [ ] Auto-replenishment rules
- [ ] Replenishment UI

#### 3.7 Shift Control
- [ ] Shift schema enhancement
- [ ] Shift opening API
- [ ] Shift closing API
- [ ] Cash declaration
- [ ] Shift variance calculation
- [ ] Shift UI

#### 3.8 Tender Reconciliation
- [ ] Reconciliation schema (exists in Phase 3)
- [ ] Reconciliation API
- [ ] Auto-reconciliation logic
- [ ] Exception handling
- [ ] Reconciliation UI
- [ ] Exception resolution UI

#### 3.9 Staff Administration
- [ ] Staff schema
- [ ] Staff CRUD API
- [ ] Role management
- [ ] Permission management
- [ ] Staff list UI
- [ ] Staff detail UI
- [ ] Role/permission UI

#### 3.10 Audit Reporting
- [ ] Audit log viewer API
- [ ] Audit search API
- [ ] Audit export API
- [ ] Audit report generation
- [ ] Audit viewer UI
- [ ] Audit report UI

### Acceptance Gate
- [ ] All modules have append-only history
- [ ] All modules support reversals
- [ ] All modules have authorization
- [ ] All modules have audit logging
- [ ] All modules have idempotency
- [ ] All modules have reconciliation
- [ ] End-to-end tests pass
- [ ] UI is complete and tested
- [ ] Migration scripts provided

### Deliverables
- Schema updates
- Backend services
- Frontend UI components
- API documentation
- Test suite
- Migration scripts
- User documentation

---

## Work Package 4: eSewa and Khalti Integration

### Owner
Backend Developer

### Dependencies
- None (can start with sandbox/mocked tests)

### Estimate
- eSewa integration: 5 days
- Khalti integration: 5 days
- Testing: 3 days
- Documentation: 2 days
- Total: 15 days

### Tasks

#### 4.1 eSewa Integration
- [ ] Obtain merchant credentials
- [ ] Review official API specifications
- [ ] Implement payment intent creation
- [ ] Implement signed request
- [ ] Implement webhook verification
- [ ] Implement timestamp/replay protection
- [ ] Implement idempotent processing
- [ ] Implement server-side status verification
- [ ] Implement delayed callback handling
- [ ] Implement duplicate callback handling
- [ ] Implement failure handling
- [ ] Implement cancellation handling
- [ ] Implement refund support
- [ ] Implement daily reconciliation
- [ ] Implement StoreSync tender reconciliation
- [ ] Add privacy-safe logging

#### 4.2 Khalti Integration
- [ ] Same tasks as eSewa

#### 4.3 Testing
- [ ] Sandbox testing for eSewa
- [ ] Sandbox testing for Khalti
- [ ] Mocked tests (if credentials unavailable)
- [ ] Idempotency tests
- [ ] Replay attack tests
- [ ] Duplicate callback tests
- [ ] Failure scenario tests
- [ ] Refund tests
- [ ] Reconciliation tests

### Acceptance Gate
- [ ] Payment intent created server-side
- [ ] Exact NPR amount used
- [ ] Provider transaction reference captured
- [ ] Requests signed where required
- [ ] Webhook verified
- [ ] Timestamp/replay protection working
- [ ] Idempotent processing verified
- [ ] Server-side status verification working
- [ ] Delayed callbacks handled
- [ ] Duplicate callbacks handled
- [ ] Failures and cancellations handled
- [ ] Refunds supported
- [ ] Daily reconciliation working
- [ ] StoreSync reconciliation working
- [ ] Privacy-safe logs
- [ ] No browser redirect trusted as proof
- [ ] Sandbox tests pass
- [ ] Controlled production tests pass

### Deliverables
- Payment integration service
- Webhook handlers
- Reconciliation jobs
- Test suite
- API documentation
- Integration guide

### External Blocker Handling
If credentials or specs unavailable:
- [ ] Implement safe integration boundary
- [ ] Create sandbox/mocked tests
- [ ] Document external blocker
- [ ] Report to stakeholders

---

## Work Package 5: E-commerce Readiness

### Owner
Backend Developer + Frontend Developer

### Dependencies
- Work Package 3 (Operational Modules) - for inventory
- Work Package 4 (Payments) - for payment intents

### Estimate
- Design: 5 days
- Backend implementation: 15 days
- Frontend implementation: 15 days
- Testing: 5 days
- Documentation: 3 days
- Total: 43 days

### Tasks

#### 5.1 Catalog (Behind Feature Flag)
- [ ] Public catalog publication schema
- [ ] Catalog API
- [ ] Pricing and promotions API
- [ ] Sellable inventory API
- [ ] Safety stock rules
- [ ] Availability projection
- [ ] Catalog UI (feature-gated)

#### 5.2 Cart and Reservations
- [ ] Cart schema
- [ ] Cart API
- [ ] Inventory reservations schema
- [ ] Reservation API
- [ ] Reservation expiry job
- [ ] Reservation release
- [ ] Cart UI (feature-gated)

#### 5.3 Order Management
- [ ] Order schema
- [ ] Order creation API
- [ ] Order state history
- [ ] Payment intent integration
- [ ] Store acceptance workflow
- [ ] Order API
- [ ] Order UI (feature-gated)

#### 5.4 Fulfillment (Click-and-Collect Only)
- [ ] Picking workflow
- [ ] Substitution workflow
- [ ] Ready-for-pickup state
- [ ] Pickup verification
- [ ] Completion
- [ ] Fulfillment API
- [ ] Fulfillment UI (feature-gated)

#### 5.5 Order Lifecycle
- [ ] Cancellation workflow
- [ ] Returns workflow
- [ ] Refund integration
- [ ] Loyalty effects
- [ ] Notifications
- [ ] Lifecycle API

#### 5.6 Support Tools
- [ ] Order search
- [ ] Order details
- [ ] Customer order history
- [ ] Support actions
- [ ] Support UI (feature-gated)

#### 5.7 Data Recording
- [ ] Exact price per order line
- [ ] Promotion version per order line
- [ ] Tax treatment per order line
- [ ] Fulfillment location per order line
- [ ] Rule version per order line

### Acceptance Gate (Commerce Launch Gate)
- [ ] Reservation concurrency prevents overselling
- [ ] Safety-stock rules work
- [ ] Prices/promotions reproduce from recorded versions
- [ ] Payment retries/duplicates/delays/failures/refunds reconcile
- [ ] Order-state transitions validated and audited
- [ ] Cancellation releases inventory
- [ ] Returns reconcile inventory, payment, sale, loyalty
- [ ] Store staff can pick, substitute, stage, verify pickup
- [ ] Customer support tools and escalation exist
- [ ] Legal terms approved
- [ ] Privacy policy approved
- [ ] Cancellation policy approved
- [ ] Refund policy approved
- [ ] Fulfillment policy approved
- [ ] Security tests pass
- [ ] Load tests pass
- [ ] Monitoring tested
- [ ] Backups tested
- [ ] Rollback tested
- [ ] Incident procedures tested
- [ ] Business approval
- [ ] Operations approval
- [ ] Finance approval
- [ ] Security approval
- [ ] Checkout remains disabled until gate passes

### Deliverables
- E-commerce schema
- Backend services
- Frontend UI (feature-gated)
- API documentation
- Test suite
- Feature flag configuration
- Policy documents

---

## Work Package 6: Security and Recovery

### Owner
Security Engineer + DevOps Engineer

### Dependencies
- None (can start immediately)

### Estimate
- Threat model review: 3 days
- Security hardening: 5 days
- Secret management: 3 days
- Backup implementation: 5 days
- Testing: 5 days
- Documentation: 3 days
- Total: 24 days

### Tasks

#### 6.1 Security Review
- [ ] Threat model review
- [ ] Role and permission review
- [ ] Dependency scanning
- [ ] Secret scanning
- [ ] Security header review
- [ ] Customer data retention review
- [ ] Privacy request workflow review
- [ ] Export audit review

#### 6.2 Security Hardening
- [ ] MFA for privileged users
- [ ] Secret management implementation
- [ ] Security headers implementation
- [ ] Customer data retention policies
- [ ] Privacy request workflows
- [ ] Export audit logging
- [ ] Fix any critical security findings

#### 6.3 Backup and Recovery
- [ ] Automated database backups
- [ ] Backup verification
- [ ] Point-in-time recovery
- [ ] Configuration backups
- [ ] Backup retention policies
- [ ] Restore procedures
- [ ] Disaster recovery procedures

#### 6.4 Testing
- [ ] Incident response exercise
- [ ] Backup verification test
- [ ] Isolated restore test
- [ ] Disaster recovery exercise
- [ ] Capacity test
- [ ] Load test
- [ ] Certificate/domain monitoring setup
- [ ] Alert ownership and escalation setup

### Acceptance Gate
- [ ] Threat model reviewed
- [ ] Roles and permissions reviewed
- [ ] MFA implemented for privileged users
- [ ] Secret management implemented
- [ ] Dependency scanning automated
- [ ] Secret scanning automated
- [ ] Security headers implemented
- [ ] Customer data retention defined
- [ ] Privacy request workflows working
- [ ] Export audit logging working
- [ ] No critical security finding remains
- [ ] Backups automated and verified
- [ ] Point-in-time recovery tested
- [ ] Isolated restore tested
- [ ] Disaster recovery exercise completed
- [ ] Capacity test passed
- [ ] Load test passed
- [ ] Certificate/domain monitoring working
- [ ] Alert ownership defined
- [ ] Escalation procedures defined

### Deliverables
- Threat model document
- Security review report
- Secret management configuration
- Backup procedures
- Recovery procedures
- Test results
- Security policies

---

## Work Package 7: Rollout and Handover

### Owner
Project Manager + DevOps Engineer

### Dependencies
- Work Package 1 (Networking) - for store connectivity
- Work Package 2 (Offline Sync) - for store operations
- Work Package 3 (Operational Modules) - for full functionality
- Work Package 6 (Security) - for production safety
- Work Package 5 (E-commerce) - only if launching e-commerce

### Estimate
- Development verification: 2 days
- Staging verification: 2 days
- Internal test location: 3 days
- Store 1 pilot: 5 days (including monitoring period)
- Remaining stores rollout: 2 days per store
- Warehouse rollout: 3 days
- Training: 3 days
- Documentation: 5 days
- Handover: 2 days
- Total: ~35 days (for 5 stores)

### Tasks

#### 7.1 Pre-Rollout
- [ ] Development verification
- [ ] Staging verification
- [ ] Internal test location deployment
- [ ] Internal test location verification

#### 7.2 Store 1 Pilot
- [ ] Store 1 deployment
- [ ] Store 1 training
- [ ] Store 1 go-live
- [ ] Stable monitored pilot period (7 days)
- [ ] Issue resolution
- [ ] Pilot results documentation

#### 7.3 Multi-Store Rollout
- [ ] Store 2 deployment and training
- [ ] Store 3 deployment and training
- [ ] Store 4 deployment and training
- [ ] Store 5 deployment and training
- [ ] Monitoring and support

#### 7.4 Warehouse Rollout
- [ ] Warehouse deployment
- [ ] Warehouse training
- [ ] Warehouse go-live
- [ ] Monitoring and support

#### 7.5 E-commerce Pilot (Separate Gate)
- [ ] Only after commerce launch gate passes
- [ ] E-commerce deployment
- [ ] E-commerce monitoring
- [ ] E-commerce support

#### 7.6 Training
- [ ] Staff training materials
- [ ] Staff training sessions
- [ ] Manager training materials
- [ ] Manager training sessions
- [ ] Training verification

#### 7.7 Documentation
- [ ] Support guide
- [ ] Incident runbooks
- [ ] Network diagrams
- [ ] Device inventory
- [ ] Vendor contacts
- [ ] Backup and recovery guide
- [ ] Deployment guide
- [ ] Monitoring guide
- [ ] Data reconciliation guide
- [ ] Known limitations
- [ ] Maintenance calendar
- [ ] Ownership matrix

#### 7.8 Handover
- [ ] Formal handover record
- [ ] Knowledge transfer sessions
- [ ] Support handover
- [ ] Operations handover

### Acceptance Gate
- [ ] Development verification complete
- [ ] Staging verification complete
- [ ] Internal test location verified
- [ ] Store 1 operates stably for pilot period
- [ ] Multi-store rollout monitored and supportable
- [ ] Warehouse rollout verified
- [ ] E-commerce remains disabled unless separate gate passes
- [ ] Staff training complete
- [ ] Manager training complete
- [ ] Support guide delivered
- [ ] Incident runbooks delivered
- [ ] Network diagrams delivered
- [ ] Device inventory delivered
- [ ] Vendor contacts delivered
- [ ] Backup and recovery guide delivered
- [ ] Deployment guide delivered
- [ ] Monitoring guide delivered
- [ ] Data reconciliation guide delivered
- [ ] Known limitations documented
- [ ] Maintenance calendar defined
- [ ] Ownership matrix defined
- [ ] Formal handover record signed

### Deliverables
- Training materials
- Training completion records
- Support guide
- Incident runbooks
- Network diagrams
- Device inventory
- Vendor contact list
- Backup and recovery guide
- Deployment guide
- Monitoring guide
- Data reconciliation guide
- Known limitations document
- Maintenance calendar
- Ownership matrix
- Formal handover record

---

## Work Package Dependencies

```
WP1 (Networking) ──────────────────────────────────────────────┐
                                                              │
WP2 (Offline Sync) ────────┐                                 │
                            │                                 │
WP3 (Operational Modules) ─┼───┐                             │
                            │   │                             │
WP4 (Payments) ─────────────┼───┼───┐                         │
                            │   │   │                         │
WP5 (E-commerce) ───────────┴───┴───┴───┐                   │
                                        │                   │
WP6 (Security) ─────────────────────────┼───────────────────┤
                                        │                   │
WP7 (Rollout) ──────────────────────────┴───────────────────┴───┐
                                                                    │
All must complete before final acceptance ──────────────────────────┘
```

## Recommended Execution Order

### Phase 4A (Can start in parallel)
1. WP1: Networking (Infrastructure team)
2. WP2: Offline Synchronization (Backend)
3. WP6: Security and Recovery (Security/DevOps)

### Phase 4B (After WP2 and WP4)
4. WP4: eSewa/Khalti Integration (Backend) - can start with sandbox
5. WP3: Operational Modules (Backend + Frontend)

### Phase 4C (After WP3, WP4, WP5)
6. WP5: E-commerce Readiness (Backend + Frontend) - behind feature flags

### Phase 4D (After WP1, WP2, WP3, WP6)
7. WP7: Rollout and Handover (Project Manager)

## Total Timeline Estimate

- Phase 4A: ~24 days (parallel execution)
- Phase 4B: ~38 days (WP3 depends on WP2/WP4)
- Phase 4C: ~43 days (WP5 depends on WP3/WP4)
- Phase 4D: ~35 days (depends on WP1, WP2, WP3, WP6)

**Critical Path:** WP2 → WP3 → WP7 = 20 + 38 + 35 = 93 days (~15 weeks)

**With Parallel Execution:** ~65 days (~11 weeks)

## Resource Requirements

### Backend Developers
- WP2: 1 developer (20 days)
- WP4: 1 developer (15 days)
- WP3: 1-2 developers (38 days)
- WP5: 1-2 developers (43 days)
- Total backend effort: ~116-156 developer-days

### Frontend Developers
- WP3: 1 developer (10 days)
- WP5: 1 developer (15 days)
- Total frontend effort: ~25 developer-days

### Infrastructure/Network
- WP1: 1 network engineer (18 days)
- WP6: 1 DevOps engineer (12 days)
- Total infrastructure effort: ~30 engineer-days

### Security
- WP6: 1 security engineer (12 days)
- Total security effort: ~12 engineer-days

### Project Management
- WP7: 1 project manager (35 days)
- Total PM effort: ~35 manager-days

### Training
- WP7: 1 trainer (6 days)
- Total training effort: ~6 trainer-days

**Total Effort:** ~224-264 person-days

## Risk Mitigation

### Schedule Risks
- **External dependencies (eSewa/Khalti):** Start with sandbox/mocked tests, report blockers early
- **Network infrastructure:** Start WP1 immediately, coordinate with store locations
- **Resource availability:** Cross-train team members, consider contractors for peak load

### Technical Risks
- **Offline sync complexity:** Comprehensive testing, fallback procedures
- **Payment integration failures:** Sandbox testing, mock implementations
- **Security vulnerabilities:** Early security review, continuous scanning
- **Data migration:** Migration scripts, testing, rollback procedures

### Operational Risks
- **Store rollout issues:** Pilot at internal test location first, staged rollout
- **Training gaps:** Comprehensive materials, hands-on sessions
- **Support readiness:** Support tools, escalation procedures, runbooks
