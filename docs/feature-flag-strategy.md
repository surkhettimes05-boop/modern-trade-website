# Feature Flag Strategy

## Overview
Feature flags enable gradual rollouts, country-specific functionality, and experimental features without code deployments. This strategy defines how NOVA MART will implement and manage feature flags across the platform.

## Flag Types

### 1. Country Flags
Control country-specific functionality based on store/organization country code.

**Examples:**
- `ENABLE_NEPAL_IRD_TAX`: Nepal IRD tax integration
- `ENABLE_ESEWA_PAYMENT`: eSewa payment provider
- `ENABLE_KHALTI_PAYMENT`: Khalti payment provider
- `ENABLE_NEPALESE_LOCALE`: Nepali language support
- `ENABLE_GST_TAX`: India GST tax integration
- `ENABLE_RAZORPAY`: Razorpay payment provider
- `ENABLE_UPI`: UPI payment integration

**Evaluation Logic:**
```typescript
function isCountryFlagEnabled(flagKey: string, countryCode: string): boolean {
  const flag = getFeatureFlag(flagKey);
  if (!flag || !flag.isActive) return false;
  if (flag.targetCountries?.includes(countryCode)) return true;
  return flag.defaultValue;
}
```

### 2. Module Flags
Enable/disable entire functional modules (e.g., new inventory system, advanced analytics).

**Examples:**
- `ENABLE_NEW_INVENTORY_SYSTEM`: New inventory management UI
- `ENABLE_ADVANCED_ANALYTICS`: Advanced analytics dashboard
- `ENABLE_CUSTOMER_SEGMENTS`: Customer segmentation module

**Evaluation Logic:**
```typescript
function isModuleFlagEnabled(flagKey: string, userCapabilities: string[]): boolean {
  const flag = getFeatureFlag(flagKey);
  if (!flag || !flag.isActive) return false;
  if (flag.targetRoles?.some(role => userCapabilities.includes(role))) return true;
  return flag.defaultValue;
}
```

### 3. Experiment Flags
A/B testing and gradual rollouts for new features.

**Examples:**
- `EXP_NEW_CHECKOUT_FLOW`: New checkout UI experiment
- `EXP_PRODUCT_RECOMMENDATIONS`: ML-based product recommendations

**Evaluation Logic:**
```typescript
function isExperimentEnabled(flagKey: string, userId: string): boolean {
  const flag = getFeatureFlag(flagKey);
  if (!flag || !flag.isActive) return false;
  if (flag.rolloutPercentage === 100) return true;
  if (flag.rolloutPercentage === 0) return false;
  const hash = hashUserId(userId);
  return (hash % 100) < flag.rolloutPercentage;
}
```

### 4. Deployment Flags
Control deployment of breaking changes or infrastructure updates.

**Examples:**
- `DEPLOY_NEW_DATABASE_SCHEMA`: New database schema migration
- `DEPLOY_CDN_MIGRATION`: CDN migration

**Evaluation Logic:**
```typescript
function isDeploymentFlagEnabled(flagKey: string): boolean {
  const flag = getFeatureFlag(flagKey);
  return flag?.isActive && flag.defaultValue;
}
```

## Flag Hierarchy and Precedence

Feature flags are evaluated in the following order (highest to lowest priority):

1. **User-specific override** (if user has explicit flag assignment)
2. **Store-specific override** (if store has explicit flag assignment)
3. **Country-based evaluation** (based on store country)
4. **Role-based evaluation** (based on user role/capabilities)
5. **Rollout percentage** (for experiment flags)
6. **Default value** (fallback)

## Database Schema

Feature flags are stored in the `feature_flags` table with the following structure:

```sql
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY,
    flag_key VARCHAR(100) UNIQUE NOT NULL,
    flag_name VARCHAR(255) NOT NULL,
    description TEXT,
    flag_type VARCHAR(20) NOT NULL, -- COUNTRY, MODULE, EXPERIMENT, DEPLOYMENT
    default_value BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0,
    target_countries VARCHAR(2)[],
    target_stores UUID[],
    target_roles VARCHAR(50)[],
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);
```

## Backend Implementation

### Flag Service

```typescript
// backend/src/services/featureFlags.ts
export class FeatureFlagService {
  async getFlag(flagKey: string): Promise<FeatureFlag | null> {
    // Fetch from database with caching
  }

  async isFlagEnabled(flagKey: string, context: FlagContext): Promise<boolean> {
    const flag = await this.getFlag(flagKey);
    if (!flag || !flag.isActive) return false;

    // Check user-specific override
    if (context.userId && flag.targetUsers?.includes(context.userId)) {
      return true;
    }

    // Check store-specific override
    if (context.storeId && flag.targetStores?.includes(context.storeId)) {
      return true;
    }

    // Evaluate based on flag type
    switch (flag.flagType) {
      case 'COUNTRY':
        return this.evaluateCountryFlag(flag, context.countryCode);
      case 'MODULE':
        return this.evaluateModuleFlag(flag, context.capabilities);
      case 'EXPERIMENT':
        return this.evaluateExperimentFlag(flag, context.userId);
      case 'DEPLOYMENT':
        return flag.defaultValue;
      default:
        return flag.defaultValue;
    }
  }

  private evaluateCountryFlag(flag: FeatureFlag, countryCode: string): boolean {
    if (flag.targetCountries?.includes(countryCode)) return true;
    return flag.defaultValue;
  }

  private evaluateModuleFlag(flag: FeatureFlag, capabilities: string[]): boolean {
    if (flag.targetRoles?.some(role => capabilities.includes(role))) return true;
    return flag.defaultValue;
  }

  private evaluateExperimentFlag(flag: FeatureFlag, userId: string): boolean {
    if (flag.rolloutPercentage === 100) return true;
    if (flag.rolloutPercentage === 0) return false;
    const hash = this.hashUserId(userId);
    return (hash % 100) < flag.rolloutPercentage;
  }

  private hashUserId(userId: string): number {
    // Simple hash function for consistent bucket assignment
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
```

### Middleware Integration

```typescript
// backend/src/middleware/featureFlags.ts
export async function featureFlagMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const context = this.extractFlagContext(request);
  request.featureFlags = {
    isEnabled: (flagKey: string) => this.featureFlagService.isFlagEnabled(flagKey, context)
  };
}

function extractFlagContext(request: FastifyRequest): FlagContext {
  return {
    userId: request.user?.id,
    storeId: request.user?.storeId,
    countryCode: request.user?.storeCountryCode,
    capabilities: request.user?.capabilities || []
  };
}
```

## Frontend Implementation

### Flag Context Provider

```typescript
// frontend/src/contexts/FeatureFlagContext.tsx
interface FeatureFlagContextValue {
  isEnabled: (flagKey: string) => boolean;
  flags: Record<string, boolean>;
}

export const FeatureFlagProvider = ({ children, initialFlags }: Props) => {
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);

  const isEnabled = useCallback((flagKey: string): boolean => {
    return flags[flagKey] ?? false;
  }, [flags]);

  return (
    <FeatureFlagContext.Provider value={{ isEnabled, flags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};
```

### Component Usage

```typescript
// Example component with feature flag
const CheckoutButton = () => {
  const { isEnabled } = useFeatureFlags();
  const useNewFlow = isEnabled('EXP_NEW_CHECKOUT_FLOW');

  if (useNewFlow) {
    return <NewCheckoutFlow />;
  }

  return <LegacyCheckoutFlow />;
};
```

## API Integration

### Session Endpoint Enhancement

The `/api/operations-auth/session` endpoint will return feature flags:

```typescript
// backend/src/routes/operationsAuth.ts
fastify.get('/session', async (request, reply) => {
  const user = await this.authenticateUser(request);
  const flags = await this.featureFlagService.getAllFlagsForUser(user);

  return {
    user: this.sanitizeUser(user),
    capabilities: user.capabilities,
    scopes: user.scopes,
    storeAssignment: user.storeAssignment,
    featureFlags: flags
  };
});
```

## Flag Management API

### Admin Endpoints

```typescript
// GET /api/admin/config/feature-flags
// List all feature flags
fastify.get('/config/feature-flags', {
  preHandler: [requireCapability('settings.manage')]
}, async (request, reply) => {
  const flags = await this.featureFlagService.getAllFlags();
  return { data: flags };
});

// PUT /api/admin/config/feature-flags/:key
// Update a feature flag
fastify.put('/config/feature-flags/:key', {
  preHandler: [requireCapability('settings.manage')]
}, async (request, reply) => {
  const { key } = request.params;
  const updates = request.body;
  const flag = await this.featureFlagService.updateFlag(key, updates);
  return { data: flag };
});
```

## Caching Strategy

### Redis Cache

Feature flags are cached in Redis with a 5-minute TTL to reduce database load:

```typescript
async getFlag(flagKey: string): Promise<FeatureFlag | null> {
  const cacheKey = `feature_flag:${flagKey}`;
  const cached = await this.redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }

  const flag = await this.db.featureFlags.findOne({ flagKey });
  if (flag) {
    await this.redis.setex(cacheKey, 300, JSON.stringify(flag));
  }
  
  return flag;
}
```

### Cache Invalidation

Cache is invalidated when:
- Flag is updated via admin API
- Flag is created or deleted
- Manual cache flush via admin interface

## Monitoring and Auditing

### Flag Usage Tracking

Track flag evaluation for analytics:

```typescript
async isFlagEnabled(flagKey: string, context: FlagContext): Promise<boolean> {
  const result = await this.evaluateFlag(flagKey, context);
  
  // Track evaluation (async, non-blocking)
  this.trackFlagEvaluation(flagKey, context, result);
  
  return result;
}
```

### Audit Log

All flag changes are logged to the audit trail:

```typescript
async updateFlag(flagKey: string, updates: Partial<FeatureFlag>, actor: string) {
  const previous = await this.getFlag(flagKey);
  const updated = await this.db.featureFlags.update({ flagKey }, updates);
  
  await this.auditService.log({
    action: 'FEATURE_FLAG_UPDATED',
    entity: 'feature_flag',
    entityId: flagKey,
    actor,
    changes: { previous, updated }
  });
  
  return updated;
}
```

## Initial Flag Configuration

### India Launch (Default)

```json
{
  "ENABLE_GST_TAX": true,
  "ENABLE_RAZORPAY": true,
  "ENABLE_UPI": true,
  "ENABLE_NEPAL_IRD_TAX": false,
  "ENABLE_ESEWA_PAYMENT": false,
  "ENABLE_KHALTI_PAYMENT": false,
  "ENABLE_NEPALESE_LOCALE": false
}
```

### Nepal Launch (Future)

```json
{
  "ENABLE_GST_TAX": false,
  "ENABLE_RAZORPAY": false,
  "ENABLE_UPI": false,
  "ENABLE_NEPAL_IRD_TAX": true,
  "ENABLE_ESEWA_PAYMENT": true,
  "ENABLE_KHALTI_PAYMENT": true,
  "ENABLE_NEPALESE_LOCALE": true
}
```

## Rollout Strategy

### Gradual Rollout Process

1. **Internal Testing**: Enable flag for internal users only
2. **Canary Release**: Enable for 1-5% of users
3. **Gradual Increase**: Increase rollout percentage by 10-20% daily
4. **Monitor**: Watch error rates, performance, user feedback
5. **Full Rollout**: Enable for 100% of users
6. **Cleanup**: Remove flag code after successful rollout

### Rollback Process

1. **Immediate**: Set flag to disabled or reduce rollout percentage
2. **Investigate**: Analyze logs and metrics
3. **Fix**: Address the issue
4. **Re-rollout**: Resume gradual rollout after fix

## Best Practices

1. **Short-lived flags**: Remove flags within 1-2 weeks after full rollout
2. **Clear naming**: Use descriptive flag names (e.g., `ENABLE_NEW_CHECKOUT` not `FLAG_123`)
3. **Documentation**: Document flag purpose, rollout plan, and success criteria
4. **Testing**: Test both enabled and disabled states
5. **Monitoring**: Monitor flag performance and user impact
6. **Access control**: Restrict flag management to authorized users only
7. **Audit trail**: Log all flag changes for audit purposes

## Security Considerations

1. **Server-side evaluation**: Critical flags must be evaluated server-side
2. **No client-side overrides**: Prevent clients from bypassing flag checks
3. **Rate limiting**: Protect flag management endpoints from abuse
4. **Encryption**: Encrypt sensitive metadata in flag configuration
5. **Backup**: Maintain flag configuration backups for quick rollback

## References

- NOVA MART Admin Implementation Plan, Section 3
- ADR-001: Multi-Country Architecture Decision
- Feature Flag Best Practices (LaunchDarkly, Split.io documentation)
