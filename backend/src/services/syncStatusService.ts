import { query } from "../database/connection.js";

interface SyncStatus {
  device_id: string;
  device_name: string;
  store_id: string;
  store_name: string;
  connection_status: "ONLINE" | "DEGRADED" | "OFFLINE";
  sync_status: "IDLE" | "SYNCING" | "ERROR" | "CONFLICT";
  pending_count: number;
  uploading_count: number;
  acknowledged_count: number;
  rejected_count: number;
  conflict_count: number;
  oldest_pending_age_minutes: number;
  newest_pending_age_minutes: number;
  last_sync_at: Date;
  last_seen_at: Date;
  clock_drift_seconds: number;
  queue_depth: number;
  sync_progress: number;
}

interface StoreSyncSummary {
  store_id: string;
  store_name: string;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_pending: number;
  total_conflicts: number;
  overall_status: "HEALTHY" | "WARNING" | "CRITICAL";
}

export class SyncStatusService {
  /**
   * Get sync status for a specific device
   */
  async getDeviceSyncStatus(deviceId: string): Promise<SyncStatus> {
    const result = await query(
      `SELECT 
        d.device_id,
        d.device_name,
        d.store_id,
        s.name as store_name,
        CASE 
          WHEN d.last_seen > NOW() - INTERVAL '5 minutes' THEN 'ONLINE'
          WHEN d.last_seen > NOW() - INTERVAL '30 minutes' THEN 'DEGRADED'
          ELSE 'OFFLINE'
        END as connection_status,
        CASE 
          WHEN COUNT(*) FILTER (WHERE sync_status = 'UPLOADING') > 0 THEN 'SYNCING'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'REJECTED') > 0 THEN 'ERROR'
          WHEN COUNT(*) FILTER (WHERE conflict_detected = TRUE) > 0 THEN 'CONFLICT'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'PENDING') > 0 THEN 'IDLE'
          ELSE 'IDLE'
        END as sync_status,
        COUNT(*) FILTER (WHERE sync_status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE sync_status = 'UPLOADING') as uploading_count,
        COUNT(*) FILTER (WHERE sync_status = 'ACKNOWLEDGED') as sync_acknowledged_count,
        COUNT(*) FILTER (WHERE sync_status = 'REJECTED') as rejected_count,
        COUNT(*) FILTER (WHERE conflict_detected = TRUE) as conflict_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'))) / 60 as oldest_pending_age_minutes,
        EXTRACT(EPOCH FROM (NOW() - MAX(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'))) / 60 as newest_pending_age_minutes,
        MAX(server_acknowledged_at) as last_sync_at,
        d.last_seen as last_seen_at,
        COALESCE((SELECT drift_seconds FROM clock_drift_log WHERE device_id = d.device_id ORDER BY detected_at DESC LIMIT 1), 0) as clock_drift_seconds,
        COUNT(*) as queue_depth,
        CASE 
          WHEN COUNT(*) = 0 THEN 100
          ELSE (COUNT(*) FILTER (WHERE sync_status = 'ACKNOWLEDGED')::numeric / COUNT(*)) * 100
        END as sync_progress
      FROM devices d
      LEFT JOIN stores s ON d.store_id = s.id
      LEFT JOIN offline_transaction_queue otq ON d.device_id = otq.device_id
      WHERE d.device_id = $1
      GROUP BY d.device_id, d.device_name, d.store_id, s.name, d.last_seen`,
      [deviceId],
    );

    if (result.rows.length === 0) {
      throw new Error("Device not found");
    }

    return result.rows[0];
  }

  /**
   * Get sync status for all devices in a store
   */
  async getStoreDeviceSyncStatus(storeId: string): Promise<SyncStatus[]> {
    const result = await query(
      `SELECT 
        d.device_id,
        d.device_name,
        d.store_id,
        s.name as store_name,
        CASE 
          WHEN d.last_seen > NOW() - INTERVAL '5 minutes' THEN 'ONLINE'
          WHEN d.last_seen > NOW() - INTERVAL '30 minutes' THEN 'DEGRADED'
          ELSE 'OFFLINE'
        END as connection_status,
        CASE 
          WHEN COUNT(*) FILTER (WHERE sync_status = 'UPLOADING') > 0 THEN 'SYNCING'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'REJECTED') > 0 THEN 'ERROR'
          WHEN COUNT(*) FILTER (WHERE conflict_detected = TRUE) > 0 THEN 'CONFLICT'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'PENDING') > 0 THEN 'IDLE'
          ELSE 'IDLE'
        END as sync_status,
        COUNT(*) FILTER (WHERE sync_status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE sync_status = 'UPLOADING') as uploading_count,
        COUNT(*) FILTER (WHERE sync_status = 'ACKNOWLEDGED') as acknowledged_count,
        COUNT(*) FILTER (WHERE sync_status = 'REJECTED') as rejected_count,
        COUNT(*) FILTER (WHERE conflict_detected = TRUE) as conflict_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'))) / 60 as oldest_pending_age_minutes,
        EXTRACT(EPOCH FROM (NOW() - MAX(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'))) / 60 as newest_pending_age_minutes,
        MAX(server_acknowledged_at) as last_sync_at,
        d.last_seen as last_seen_at,
        COALESCE((SELECT drift_seconds FROM clock_drift_log WHERE device_id = d.device_id ORDER BY detected_at DESC LIMIT 1), 0) as clock_drift_seconds,
        COUNT(*) as queue_depth,
        CASE 
          WHEN COUNT(*) = 0 THEN 100
          ELSE (COUNT(*) FILTER (WHERE sync_status = 'ACKNOWLEDGED')::numeric / COUNT(*)) * 100
        END as sync_progress
      FROM devices d
      LEFT JOIN stores s ON d.store_id = s.id
      LEFT JOIN offline_transaction_queue otq ON d.device_id = otq.device_id
      WHERE d.store_id = $1
      GROUP BY d.device_id, d.device_name, d.store_id, s.name, d.last_seen
      ORDER BY d.device_name`,
      [storeId],
    );

    return result.rows;
  }

  /**
   * Get sync status for all stores
   */
  async getAllStoresSyncStatus(): Promise<StoreSyncSummary[]> {
    const result = await query(
      `SELECT 
        s.id as store_id,
        s.name as store_name,
        COUNT(DISTINCT d.id) as total_devices,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen > NOW() - INTERVAL '5 minutes') as online_devices,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen <= NOW() - INTERVAL '5 minutes') as offline_devices,
        COALESCE(SUM(COUNT(*) FILTER (WHERE sync_status = 'PENDING')) OVER (PARTITION BY d.store_id), 0) as total_pending,
        COALESCE(SUM(COUNT(*) FILTER (WHERE conflict_detected = TRUE)) OVER (PARTITION BY d.store_id), 0) as total_conflicts,
        CASE 
          WHEN COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen <= NOW() - INTERVAL '5 minutes') = COUNT(DISTINCT d.id) THEN 'CRITICAL'
          WHEN COALESCE(SUM(COUNT(*) FILTER (WHERE conflict_detected = TRUE)) OVER (PARTITION BY d.store_id), 0) > 0 THEN 'CRITICAL'
          WHEN COALESCE(SUM(COUNT(*) FILTER (WHERE sync_status = 'PENDING')) OVER (PARTITION BY d.store_id), 0) > 100 THEN 'WARNING'
          WHEN COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen <= NOW() - INTERVAL '30 minutes') > 0 THEN 'WARNING'
          ELSE 'HEALTHY'
        END as overall_status
      FROM stores s
      LEFT JOIN devices d ON s.id = d.store_id
      LEFT JOIN offline_transaction_queue otq ON d.device_id = otq.device_id
      GROUP BY s.id, s.name
      ORDER BY s.name`,
    );

    return result.rows;
  }

  /**
   * Get sync status summary for all devices
   */
  async getGlobalSyncSummary(): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(DISTINCT d.id) as total_devices,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen > NOW() - INTERVAL '5 minutes') as online_devices,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen > NOW() - INTERVAL '30 minutes' AND d.last_seen <= NOW() - INTERVAL '5 minutes') as degraded_devices,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_seen <= NOW() - INTERVAL '30 minutes') as offline_devices,
        COUNT(*) FILTER (WHERE sync_status = 'PENDING') as total_pending,
        COUNT(*) FILTER (WHERE sync_status = 'UPLOADING') as total_uploading,
        COUNT(*) FILTER (WHERE sync_status = 'REJECTED') as total_rejected,
        COUNT(*) FILTER (WHERE conflict_detected = TRUE) as total_conflicts,
        COUNT(DISTINCT d.store_id) as total_stores,
        COUNT(DISTINCT d.store_id) FILTER (WHERE COUNT(*) FILTER (WHERE sync_status = 'PENDING') > 0) > 0 as stores_with_pending
      FROM devices d
      LEFT JOIN offline_transaction_queue otq ON d.device_id = otq.device_id`,
    );

    return result.rows[0];
  }

  /**
   * Get recent sync activity
   */
  async getRecentSyncActivity(limit: number = 50): Promise<any[]> {
    const result = await query(
      `SELECT 
        sbl.batch_id,
        sbl.device_id,
        d.device_name,
        sbl.store_id,
        st.name as store_name,
        sbl.transaction_count,
        sbl.upload_status,
        sbl.upload_started_at,
        sbl.upload_completed_at,
        sbl.error_message,
        sbl.retry_count
      FROM sync_batch_log sbl
      JOIN devices d ON sbl.device_id = d.device_id
      LEFT JOIN stores st ON sbl.store_id = st.id
      ORDER BY sbl.upload_started_at DESC
      LIMIT $1`,
      [limit],
    );

    return result.rows;
  }

  /**
   * Get conflicts requiring attention
   */
  async getActiveConflicts(limit: number = 50): Promise<any[]> {
    const result = await query(
      `SELECT 
        otq.id,
        otq.transaction_uuid,
        otq.device_id,
        d.device_name,
        otq.store_id,
        s.name as store_name,
        otq.transaction_type,
        otq.conflict_type,
        otq.original_occurrence_timestamp,
        otq.sync_status,
        otq.sync_error_message
      FROM offline_transaction_queue otq
      JOIN devices d ON otq.device_id = d.device_id
      LEFT JOIN stores s ON otq.store_id = s.id
      WHERE otq.conflict_detected = TRUE
        AND otq.conflict_resolution IS NULL
      ORDER BY otq.original_occurrence_timestamp DESC
      LIMIT $1`,
      [limit],
    );

    return result.rows;
  }

  /**
   * Get devices with issues
   */
  async getDevicesWithIssues(): Promise<any[]> {
    const result = await query(
      `SELECT 
        d.device_id,
        d.device_name,
        d.store_id,
        s.name as store_name,
        CASE 
          WHEN d.last_seen <= NOW() - INTERVAL '30 minutes' THEN 'OFFLINE'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'REJECTED') > 0 THEN 'SYNC_ERROR'
          WHEN COUNT(*) FILTER (WHERE conflict_detected = TRUE) > 0 THEN 'CONFLICT'
          WHEN COUNT(*) FILTER (WHERE sync_status = 'PENDING') > 100 THEN 'HIGH_QUEUE'
          ELSE 'OK'
        END as issue_type,
        d.last_seen,
        COUNT(*) FILTER (WHERE sync_status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE sync_status = 'REJECTED') as rejected_count,
        COUNT(*) FILTER (WHERE conflict_detected = TRUE) as conflict_count
      FROM devices d
      LEFT JOIN stores s ON d.store_id = s.id
      LEFT JOIN offline_transaction_queue otq ON d.device_id = otq.device_id
      GROUP BY d.device_id, d.device_name, d.store_id, s.name, d.last_seen
      HAVING 
        d.last_seen <= NOW() - INTERVAL '30 minutes'
        OR COUNT(*) FILTER (WHERE sync_status = 'REJECTED') > 0
        OR COUNT(*) FILTER (WHERE conflict_detected = TRUE) > 0
        OR COUNT(*) FILTER (WHERE sync_status = 'PENDING') > 100
      ORDER BY 
        CASE 
          WHEN d.last_seen <= NOW() - INTERVAL '30 minutes' THEN 1
          WHEN COUNT(*) FILTER (WHERE sync_status = 'REJECTED') > 0 THEN 2
          WHEN COUNT(*) FILTER (WHERE conflict_detected = TRUE) > 0 THEN 3
          ELSE 4
        END,
        d.last_seen`,
    );

    return result.rows;
  }
}
