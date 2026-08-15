# Offline Synchronization Recovery Runbook

## Overview
This runbook provides procedures for recovering from offline synchronization failures and data integrity issues in the StoreSync system.

## Prerequisites
- Access to PostgreSQL database
- Access to application logs
- Access to device management interface
- Understanding of sync status indicators

## Sync Status Indicators

| Status | Meaning | Action Required |
|--------|---------|----------------|
| ONLINE | Device connected, sync current | None |
| DEGRADED | Device connected, sync delayed | Monitor |
| OFFLINE | Device disconnected | Investigate network |
| SYNCING | Sync in progress | Monitor |
| ERROR | Sync failed | Follow recovery procedures |
| CONFLICT | Data conflict detected | Resolve conflict |

## Recovery Procedures

### 1. Sudden Disconnect Recovery

**Symptoms:**
- Device shows OFFLINE status
- Queue depth increasing
- Last sync timestamp stale

**Procedure:**
1. Check network connectivity at store
2. Verify device power and operation
3. Check router/firewall logs
4. Verify WAN connectivity
5. If network restored:
   - Device should auto-reconnect
   - Sync should resume automatically
   - Monitor queue depth decreasing
6. If network not restored:
   - Initiate backup WAN if available
   - Contact ISP for outage information
   - Consider manual data export if critical

**Verification:**
- Device status changes to ONLINE
- Queue depth starts decreasing
- No new conflicts detected

---

### 2. Long Outage Recovery (>24 hours)

**Symptoms:**
- Device offline for extended period
- Large queue depth (>1000 transactions)
- Reference data may be stale

**Procedure:**
1. Verify network connectivity restored
2. Check reference data versions on device vs server
3. If reference data mismatch:
   - Push latest reference data to device
   - Mark affected transactions for review
4. Initiate batch sync (limit to 100 transactions per batch)
5. Monitor for conflicts
6. Resolve conflicts as they arise
7. Verify all transactions processed
8. Reconcile with source data

**Verification:**
- Queue depth reaches 0
- No rejected transactions remain
- Data reconciliation matches source

---

### 3. Duplicate Upload Recovery

**Symptoms:**
- Duplicate transaction UUID detected
- Conflict type: DUPLICATE_UUID
- Sync status: CONFLICT

**Procedure:**
1. Identify conflicting transaction
2. Check if server transaction already exists
3. If server transaction exists:
   - Resolution: IGNORE
   - Mark local transaction as acknowledged
4. If server transaction does not exist:
   - Resolution: OVERRIDE
   - Process local transaction
   - Update server transaction ID
5. Document resolution

**Verification:**
- Conflict resolved
- No duplicate data in system
- Transaction count matches expected

---

### 4. Out-of-Order Upload Recovery

**Symptoms:**
- Sequence gap detected
- Conflict type: SEQUENCE_GAP
- Transactions missing from sequence

**Procedure:**
1. Identify gap range (missing sequence numbers)
2. Check if missing transactions exist in queue
3. If missing transactions found:
   - Process in correct order
   - Update sequence numbers if needed
4. If missing transactions not found:
   - Check device local storage
   - Check device logs for errors
   - May indicate data loss
   - Resolution: MANUAL
   - Investigate root cause
5. Document gap and resolution

**Verification:**
- Sequence gaps resolved
- No missing transactions
- Transaction continuity restored

---

### 5. Clock Drift Recovery

**Symptoms:**
- Conflict type: CLOCK_DRIFT
- Device timestamp differs from server by >5 minutes
- Transactions may have incorrect timestamps

**Procedure:**
1. Check drift amount in clock_drift_log
2. If drift < 5 minutes:
   - Resolution: IGNORE
   - Accept device timestamps
3. If drift 5-30 minutes:
   - Resolution: WARN
   - Log warning
   - Consider NTP sync on device
4. If drift > 30 minutes:
   - Resolution: CORRECT
   - Adjust timestamps to server time
   - Force NTP sync on device
   - May need to reprocess affected transactions
5. Monitor for recurring drift

**Verification:**
- Clock drift within acceptable range
- Timestamps corrected if needed
- Device NTP sync working

---

### 6. Corrupted Cache Recovery

**Symptoms:**
- Transaction data fails decryption
- Checksum mismatch
- Sync error: "Corrupted data"

**Procedure:**
1. Identify corrupted transaction
2. Check if backup exists in device local storage
3. If backup available:
   - Restore from backup
   - Re-queue transaction
4. If no backup:
   - Resolution: MANUAL
   - Contact store staff
   - Reconstruct transaction from paper records if available
   - Manual entry if necessary
5. Investigate root cause (storage failure, app crash)

**Verification:**
- Corrupted data resolved
- Transaction reprocessed successfully
- Root cause addressed

---

### 7. Full Storage Recovery

**Symptoms:**
- Device storage full
- Cannot queue new transactions
- Sync errors: "Storage full"

**Procedure:**
1. Check device storage usage
2. Identify oldest uploaded transactions
3. Purge old uploaded transactions (older than 30 days)
4. If storage still full:
   - Export critical data to external storage
   - Clear non-critical data
   - Consider storage upgrade
5. Resume normal operation
6. Monitor storage usage

**Verification:**
- Storage space available
- New transactions can be queued
- No data loss occurred

---

### 8. Server Rejection Recovery

**Symptoms:**
- Sync status: REJECTED
- Sync attempts at max
- Error message from server

**Procedure:**
1. Check error message in sync_error_message
2. Common errors and resolutions:
   - **Validation error**: Fix data, retry
   - **Business rule violation**: Contact support, manual override
   - **Database error**: Check server health, retry
   - **Network timeout**: Check connectivity, retry
3. If error resolvable:
   - Fix issue
   - Reset sync attempts
   - Retry sync
4. If error not resolvable:
   - Resolution: MANUAL
   - Escalate to technical support
   - Document for investigation

**Verification:**
- Error resolved
- Transaction processed successfully
- No recurring rejections

---

### 9. Device Replacement Recovery

**Symptoms:**
- Old device decommissioned
- New device deployed
- Need to transfer pending transactions

**Procedure:**
1. Export pending transactions from old device
2. Register new device in system
3. Import transactions to new device
4. Adjust device_id in transaction queue
5. Update local sequence numbers
6. Sync from new device
7. Verify all transactions processed
8. Decommission old device

**Verification:**
- All transactions transferred
- New device syncing normally
- Old device marked inactive

---

### 10. Primary/Backup WAN Transition

**Symptoms:**
- Primary WAN failure
- Backup WAN activated
- May cause brief sync interruption

**Procedure:**
1. Monitor network transition
2. Check device reconnection to backup WAN
3. Verify IP addressing if changed
4. Sync should resume automatically
5. Monitor for sync errors during transition
6. If sync fails:
   - Check device IP configuration
   - Check firewall rules for backup WAN
   - May need manual sync trigger

**Verification:**
- Device connected via backup WAN
- Sync resumed
- No data loss during transition

---

## Manual Sync Trigger

If automatic sync fails, manual sync can be triggered:

### API Method
```bash
POST /api/offline-sync/batches
{
  "device_id": "POS-001",
  "transaction_ids": ["uuid1", "uuid2", ...]
}

POST /api/offline-sync/batches/{batchId}/process
```

### Device Method
1. Access device sync interface
2. Select "Sync Now"
3. Choose transaction range
4. Confirm sync
5. Monitor progress

---

## Conflict Resolution Workflow

### Step 1: Identify Conflict Type
- DUPLICATE_UUID: Same transaction uploaded twice
- SEQUENCE_GAP: Missing transactions in sequence
- DATA_MISMATCH: Data differs between local and server
- CLOCK_DRIFT: Timestamp drift detected

### Step 2: Determine Resolution
- **IGNORE**: Skip local transaction (server has correct data)
- **OVERRIDE**: Use local transaction (server data wrong or missing)
- **MERGE**: Combine data from both sources (if applicable)
- **MANUAL**: Requires human investigation

### Step 3: Execute Resolution
```bash
POST /api/offline-sync/conflicts/{transactionId}/resolve
{
  "resolution": "IGNORE|OVERRIDE|MERGE|MANUAL",
  "resolved_by": "user-id",
  "notes": "Explanation of resolution"
}
```

### Step 4: Verify
- Conflict marked as resolved
- Transaction processed or acknowledged
- No new conflicts created

---

## Data Reconciliation

After sync recovery, perform reconciliation:

### Sales Reconciliation
```sql
-- Compare offline sales with server sales
SELECT 
    COUNT(*) as offline_count,
    SUM(total_amount) as offline_total
FROM offline_transaction_queue
WHERE device_id = 'POS-001' 
  AND transaction_type = 'SALE'
  AND sync_status = 'ACKNOWLEDGED';

SELECT 
    COUNT(*) as server_count,
    SUM(total_amount) as server_total
FROM sales
WHERE store_id = 'store-uuid'
  AND sale_timestamp >= '2024-01-01';
```

### Ledger Reconciliation
```sql
-- Compare offline loyalty with server ledger
SELECT 
    SUM(points_signed) as offline_points
FROM offline_transaction_queue
WHERE device_id = 'POS-001'
  AND transaction_data->>'points_earned' IS NOT NULL
  AND sync_status = 'ACKNOWLEDGED';

SELECT 
    SUM(points_signed) as server_points
FROM loyalty_ledger
WHERE entry_type = 'EARN'
  AND effective_timestamp >= '2024-01-01';
```

---

## Monitoring and Alerts

### Key Metrics to Monitor
- Queue depth (pending transactions per device)
- Queue age (oldest pending transaction)
- Sync success rate
- Conflict rate
- Clock drift
- Device last seen

### Alert Thresholds
- Queue depth > 100: Warning
- Queue depth > 500: Critical
- Queue age > 1 hour: Warning
- Queue age > 24 hours: Critical
- Conflict rate > 5%: Warning
- Clock drift > 5 minutes: Warning
- Device last seen > 30 minutes: Warning
- Device last seen > 2 hours: Critical

---

## Escalation Procedures

### Level 1: Store Staff
- Can: Check device status, trigger manual sync, basic troubleshooting
- Escalate to: Store Manager

### Level 2: Store Manager
- Can: All Level 1, resolve simple conflicts, contact support
- Escalate to: IT Support

### Level 3: IT Support
- Can: All Level 2, database queries, advanced troubleshooting
- Escalate to: Development Team

### Level 4: Development Team
- Can: All Level 3, code changes, data repairs
- Escalate to: CTO/Engineering Manager

---

## Prevention Measures

### Regular Maintenance
1. Monitor sync status daily
2. Review conflict logs weekly
3. Check clock drift monthly
4. Verify storage capacity monthly
5. Test backup WAN quarterly

### Configuration Best Practices
1. Enable NTP sync on all devices
2. Set appropriate sync intervals (every 5 minutes online, every 1 hour offline)
3. Configure adequate storage limits
4. Enable automatic retry with exponential backoff
5. Set reasonable max retry attempts (10)

### Training
1. Train staff on sync status indicators
2. Train staff on basic troubleshooting
3. Provide runbook access to all staff
4. Conduct quarterly sync drills

---

## Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| Store Manager | [Contact] | IT Support |
| IT Support | [Contact] | Development Team |
| Development Team | [Contact] | CTO |
| Emergency | [Contact] | - |

---

## Appendix: SQL Queries for Troubleshooting

### Check Device Sync Status
```sql
SELECT get_device_sync_status('POS-001');
```

### Check Pending Transactions
```sql
SELECT * FROM offline_transaction_queue
WHERE device_id = 'POS-001' AND sync_status = 'PENDING'
ORDER BY local_sequence_number;
```

### Check Conflicts
```sql
SELECT * FROM offline_transaction_queue
WHERE conflict_detected = TRUE
ORDER BY original_occurrence_timestamp DESC;
```

### Check Clock Drift
```sql
SELECT * FROM clock_drift_log
WHERE device_id = 'POS-001'
ORDER BY detected_at DESC
LIMIT 10;
```

### Check Sequence Gaps
```sql
SELECT * FROM detect_sequence_gaps('POS-001');
```

### Check Sync Batch History
```sql
SELECT * FROM sync_batch_log
WHERE device_id = 'POS-001'
ORDER BY upload_started_at DESC
LIMIT 10;
```

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2024-01-15 | 1.0 | Initial runbook | Development Team |
