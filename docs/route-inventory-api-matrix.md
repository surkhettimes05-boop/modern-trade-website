# Route Inventory and API Contract Matrix

## Overview
This document catalogs all existing backend routes and their authorization requirements, classifying them for the admin/operations platform implementation.

## Route Classification Legend
- **Status**: `USABLE` (ready as-is), `REQUIRES_EXTENSION` (needs enhancement), `COUNTRY_DISABLED` (Nepal-specific, disabled for India), `NEW` (needs implementation)
- **Auth Required**: `NONE`, `STAFF`, `ADMIN`, `SPECIFIC_CAPABILITY`
- **Scope**: `GLOBAL`, `ORGANIZATION`, `STORE`, `OWN_REGISTER`

## Existing Routes Inventory

### Public Routes
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/health` | GET | USABLE | NONE | GLOBAL | Health check |
| `/api/public/*` | GET | USABLE | NONE | GLOBAL | Public data, store finder |

### Authentication
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/auth/login` | POST | USABLE | NONE | GLOBAL | Staff login |
| `/api/auth/logout` | POST | USABLE | STAFF | GLOBAL | Staff logout |
| `/api/operations-auth/login` | POST | USABLE | NONE | GLOBAL | Operations login |
| `/api/operations-auth/session` | GET | REQUIRES_EXTENSION | STAFF | STORE | Needs capability/scope data |

### Catalog Management
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/products` | GET, POST, PUT, DELETE | REQUIRES_EXTENSION | `catalog.read`, `catalog.write` | ORGANIZATION | Needs pagination, filtering |
| `/api/categories` | GET, POST, PUT, DELETE | REQUIRES_EXTENSION | `catalog.read`, `catalog.write` | ORGANIZATION | Needs hierarchy support |
| `/api/brands` | GET, POST, PUT, DELETE | REQUIRES_EXTENSION | `catalog.read`, `catalog.write` | ORGANIZATION | New endpoints needed |
| `/api/attributes` | GET, POST, PUT, DELETE | NEW | `catalog.read`, `catalog.write` | ORGANIZATION | Product attributes |
| `/api/media` | GET, POST, DELETE | NEW | `catalog.read`, `catalog.write` | ORGANIZATION | Product images/media |

### Website & Content
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/content/pages` | GET, POST, PUT | NEW | `content.read`, `content.write` | ORGANIZATION | CMS pages |
| `/api/content/navigation` | GET, POST, PUT | NEW | `content.read`, `content.write` | ORGANIZATION | Navigation structure |
| `/api/content/seo` | GET, POST, PUT | NEW | `content.read`, `content.write` | ORGANIZATION | SEO metadata |

### Promotions & Merchandising
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/promotions` | GET, POST, PUT, DELETE | REQUIRES_EXTENSION | `promotions.read`, `promotions.write` | ORGANIZATION | Needs conflict detection |
| `/api/collections` | GET, POST, PUT, DELETE | NEW | `merchandising.read`, `merchandising.write` | ORGANIZATION | Product collections |
| `/api/homepage` | GET, POST, PUT | NEW | `merchandising.read`, `merchandising.write` | ORGANIZATION | Homepage layout |

### Orders & Fulfilment
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/orders` | GET | REQUIRES_EXTENSION | `orders.read` | STORE/ORGANIZATION | Needs filtering by status |
| `/api/orders/:id` | GET, PUT | REQUIRES_EXTENSION | `orders.read`, `orders.fulfil` | STORE | State machine enforcement |
| `/api/returns` | GET, POST, PUT | REQUIRES_EXTENSION | `orders.read`, `refunds.request` | STORE | Approval workflow needed |
| `/api/deliveries` | GET, PUT | REQUIRES_EXTENSION | `orders.read`, `orders.fulfil` | STORE | Delivery management |
| `/api/payments` | GET, POST | REQUIRES_EXTENSION | `orders.read`, `payments.read` | STORE | Reconciliation queue |

### Customers & Loyalty
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/customers` | GET | REQUIRES_EXTENSION | `customers.read`, `customers.pii` | ORGANIZATION | PII masking needed |
| `/api/customers/:id` | GET, PUT | REQUIRES_EXTENSION | `customers.read`, `customers.pii` | ORGANIZATION | Support access control |
| `/api/segments` | GET, POST, PUT | REQUIRES_EXTENSION | `customers.read`, `segments.manage` | ORGANIZATION | Customer segments |
| `/api/loyalty` | GET, POST | REQUIRES_EXTENSION | `customers.read`, `loyalty.manage` | ORGANIZATION | Loyalty adjustments |

### Inventory & Procurement
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/inventory` | GET | REQUIRES_EXTENSION | `inventory.read` | STORE | Needs batch/expiry data |
| `/api/inventory/adjustments` | POST | REQUIRES_EXTENSION | `inventory.adjust` | STORE | Reason codes, audit |
| `/api/batches` | GET, POST, PUT | USABLE | `inventory.read`, `inventory.adjust` | STORE | Batch tracking |
| `/api/transfers` | GET, POST, PUT | REQUIRES_EXTENSION | `transfers.request`, `transfers.approve` | STORE | Approval workflow |
| `/api/suppliers` | GET, POST, PUT | REQUIRES_EXTENSION | `procurement.read`, `procurement.manage` | ORGANIZATION | Supplier management |
| `/api/purchase-orders` | GET, POST, PUT | REQUIRES_EXTENSION | `procurement.read`, `procurement.manage` | ORGANIZATION | PO lifecycle |
| `/api/receiving` | GET, POST, PUT | REQUIRES_EXTENSION | `procurement.read`, `procurement.manage` | STORE | Receiving workflow |

### Store Administration
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/stores` | GET, POST, PUT | REQUIRES_EXTENSION | `stores.read`, `stores.manage` | ORGANIZATION | Store profiles |
| `/api/stores/:id/config` | GET, PUT | NEW | `stores.read`, `stores.manage` | STORE | Store-specific config |

### Staff & Organization
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/staff` | GET, POST, PUT | REQUIRES_EXTENSION | `staff.read`, `staff.manage` | ORGANIZATION | Staff lifecycle |
| `/api/roles` | GET, POST, PUT | NEW | `staff.read`, `roles.manage` | ORGANIZATION | Role definitions |
| `/api/organizations` | GET, PUT | NEW | `staff.read`, `settings.manage` | ORGANIZATION | Org settings |

### Operations (Store-Level)
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/pos` | POST | USABLE | `pos.execute` | OWN_REGISTER | POS transactions |
| `/api/shifts` | GET, POST, PUT | USABLE | `shifts.manage` | STORE | Shift management |
| `/api/tender-reconciliation` | GET, POST | USABLE | `reconciliation.read`, `reconciliation.manage` | STORE | Cash reconciliation |
| `/api/devices` | GET, POST, PUT | USABLE | `devices.manage` | STORE | Device management |

### Reports & Analytics
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/analytics` | GET | REQUIRES_EXTENSION | `reports.financial`, `reports.sales` | ORGANIZATION/STORE | Needs permission filtering |
| `/api/kpi` | GET | REQUIRES_EXTENSION | `reports.financial`, `reports.sales` | ORGANIZATION/STORE | KPI endpoints |
| `/api/metrics` | GET | USABLE | `reports.read` | ORGANIZATION/STORE | System metrics |
| `/api/alerts` | GET, PUT | USABLE | `reports.read`, `alerts.manage` | ORGANIZATION/STORE | Alert management |

### Audit & Compliance
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/audit-reports` | GET | USABLE | `audit.read` | ORGANIZATION | Audit reports |
| `/api/audit-trails` | GET | USABLE | `audit.read` | ORGANIZATION | Audit trail viewer |
| `/api/security-incidents` | GET, POST, PUT | USABLE | `audit.read`, `incidents.manage` | ORGANIZATION | Security incidents |
| `/api/ird-tax` | GET, POST | COUNTRY_DISABLED | `compliance.tax` | ORGANIZATION | Nepal IRD tax |
| `/api/fiscal-signatures` | GET, POST | COUNTRY_DISABLED | `compliance.tax` | STORE | Nepal fiscal |
| `/api/compliance-reports` | GET | COUNTRY_DISABLED | `compliance.read` | ORGANIZATION | Compliance reports |

### System & Observability
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/observability` | GET | USABLE | `system.read` | GLOBAL | System health |
| `/api/production-cache` | GET, DELETE | USABLE | `system.manage` | GLOBAL | Cache management |
| `/api/encryption` | GET, POST | USABLE | `system.manage` | GLOBAL | Key management |

### Country-Specific (Disabled for India)
| Route | Methods | Status | Auth Required | Scope | Notes |
|-------|---------|--------|--------------|-------|-------|
| `/api/esewa` | POST | COUNTRY_DISABLED | `payments.esewa` | STORE | eSewa payments |
| `/api/khalti` | POST | COUNTRY_DISABLED | `payments.khalti` | STORE | Khalti payments |

## New Routes Required for Admin Platform

### Admin Dashboard
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/dashboard/metrics` | GET | `dashboard.read` | ORGANIZATION | Head-office metrics |
| `/api/admin/dashboard/alerts` | GET | `dashboard.read` | ORGANIZATION | Actionable alerts |

### Catalog Management
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/catalog/products/import` | POST | `catalog.import` | ORGANIZATION | CSV import |
| `/api/admin/catalog/products/export` | GET | `catalog.read` | ORGANIZATION | CSV export |
| `/api/admin/catalog/products/publish` | POST | `catalog.publish` | ORGANIZATION | Bulk publish |
| `/api/admin/catalog/products/:id/preview` | GET | `catalog.read` | ORGANIZATION | Storefront preview |

### Content Management
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/content/homepage` | GET, PUT | `content.write` | ORGANIZATION | Homepage config |
| `/api/admin/content/preview` | GET | `content.read` | ORGANIZATION | Content preview |

### Promotions
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/promotions/:id/approve` | POST | `promotions.approve` | ORGANIZATION | Promotion approval |
| `/api/admin/promotions/conflicts` | GET | `promotions.read` | ORGANIZATION | Conflict detection |
| `/api/admin/promotions/preview` | POST | `promotions.read` | ORGANIZATION | Price preview |

### Orders
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/orders/:id/timeline` | GET | `orders.read` | STORE | Order timeline |
| `/api/admin/orders/:id/cancel` | POST | `orders.cancel` | STORE | Order cancellation |
| `/api/admin/returns/:id/approve` | POST | `refunds.approve` | STORE | Refund approval |

### Reports
| Route | Methods | Capability | Scope | Description |
|-------|---------|------------|-------|-------------|
| `/api/admin/reports/sales` | GET | `reports.financial` | ORGANIZATION/STORE | Sales reports |
| `/api/admin/reports/inventory` | GET | `reports.inventory` | ORGANIZATION/STORE | Inventory reports |
| `/api/admin/reports/export` | POST | `reports.export` | ORGANIZATION/STORE | Report export |

### Configuration
| Route | Methods | Capability | Scope | Description |
|----------|---------|------------|-------|-------------|
| `/api/admin/config/organization` | GET, PUT | `settings.manage` | ORGANIZATION | Org settings |
| `/api/admin/config/feature-flags` | GET, PUT | `settings.manage` | ORGANIZATION | Feature flags |
| `/api/admin/config/countries` | GET | `settings.read` | GLOBAL | Country configs |

## Authorization Matrix

### Capabilities by Role

| Capability | Platform Admin | Head Office Admin | E-commerce Manager | Catalog Manager | Merchandiser | Support Agent | Finance | Store Manager | Inventory Controller | Cashier |
|------------|----------------|-------------------|-------------------|-----------------|---------------|---------------|---------|---------------|---------------------|---------|
| `catalog.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| `catalog.write` | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - |
| `catalog.publish` | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - |
| `catalog.import` | ✓ | ✓ | - | ✓ | - | - | - | - | - | - |
| `pricing.read` | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - |
| `pricing.write` | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | - | - |
| `pricing.approve` | ✓ | ✓ | ✓ | - | ✓ | - | ✓ | - | - | - |
| `orders.read` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | - | - |
| `orders.fulfil` | ✓ | ✓ | ✓ | - | - | ✓ | - | ✓ | - | - |
| `orders.cancel` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | - | - |
| `refunds.request` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | - | - |
| `refunds.approve` | ✓ | ✓ | - | - | - | - | ✓ | - | - | - |
| `inventory.read` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | ✓ | - |
| `inventory.adjust` | ✓ | ✓ | - | - | - | - | - | ✓ | ✓ | - |
| `transfers.request` | ✓ | ✓ | - | - | - | - | - | ✓ | ✓ | - |
| `transfers.approve` | ✓ | ✓ | - | - | - | - | - | ✓ | - | - |
| `customers.read` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | - | - |
| `customers.pii` | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - | - |
| `segments.manage` | ✓ | ✓ | ✓ | - | ✓ | - | - | - | - | - |
| `loyalty.manage` | ✓ | ✓ | ✓ | - | - | ✓ | - | ✓ | - | - |
| `staff.read` | ✓ | ✓ | ✓ | - | - | - | - | ✓ | - | - |
| `staff.manage` | ✓ | ✓ | ✓ | - | - | - | - | ✓ | - | - |
| `roles.manage` | ✓ | ✓ | - | - | - | - | - | - | - | - |
| `stores.read` | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ | ✓ | - |
| `stores.manage` | ✓ | ✓ | ✓ | - | - | - | - | - | - | - |
| `reports.financial` | ✓ | ✓ | ✓ | - | - | - | ✓ | ✓ | - | - |
| `reports.sales` | ✓ | ✓ | ✓ | - | ✓ | - | ✓ | ✓ | - | - |
| `reports.inventory` | ✓ | ✓ | - | - | - | - | - | ✓ | ✓ | - |
| `reports.export` | ✓ | ✓ | ✓ | - | - | - | ✓ | ✓ | - | - |
| `audit.read` | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - | - |
| `settings.manage` | ✓ | ✓ | - | - | - | - | - | - | - | - |
| `dashboard.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pos.execute` | - | - | - | - | - | - | - | - | - | ✓ |
| `shifts.manage` | - | - | - | - | - | - | - | ✓ | - | - |
| `reconciliation.manage` | - | - | - | - | - | - | - | ✓ | - | - |
| `devices.manage` | - | - | - | - | - | - | - | ✓ | - | - |
| `incidents.manage` | ✓ | ✓ | - | - | - | - | - | - | - | - |
| `system.manage` | ✓ | - | - | - | - | - | - | - | - | - |

## Scope Hierarchy

1. **GLOBAL**: Platform administrators, system-level operations
2. **ORGANIZATION**: Head-office staff, regional managers
3. **STORE**: Store managers, inventory controllers, cashiers
4. **OWN_REGISTER**: Specific cashiers at their register

## Implementation Priority

### Phase 1 (WP0-WP1)
- Authentication/authorization foundation
- Session endpoint with capabilities
- Basic route inventory

### Phase 2 (WP2-WP3)
- Dashboard endpoints
- Catalog management extensions
- Content management new routes

### Phase 3 (WP4-WP5)
- Promotion management
- Order fulfilment
- Customer service

### Phase 4 (WP6-WP7)
- Inventory/procurement extensions
- Staff/organization management
- Reports and audit

### Phase 5 (WP8)
- Production hardening
- Performance optimization
- Security testing
