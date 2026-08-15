import { query } from "../database/connection.js";
import { redisService } from "./redisService.js";

interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface LogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: Date;
  context?: any;
  tags?: Record<string, string>;
}

export class ObservabilityService {
  /**
   * Record metric
   */
  async recordMetric(metric: Metric): Promise<void> {
    // Store in Redis for real-time monitoring
    const key = `metrics:${metric.name}`;
    const value = JSON.stringify({
      value: metric.value,
      timestamp: metric.timestamp,
      tags: metric.tags,
    });

    await redisService.set(key, value, 300); // 5 minutes TTL

    // Store in database for historical analysis
    await query(
      `INSERT INTO metrics (metric_name, value, timestamp, tags)
       VALUES ($1, $2, $3, $4)`,
      [
        metric.name,
        metric.value,
        metric.timestamp,
        JSON.stringify(metric.tags || {}),
      ],
    );
  }

  /**
   * Get metrics by name
   */
  async getMetrics(
    name: string,
    options: {
      start_date?: Date;
      end_date?: Date;
      limit?: number;
    } = {},
  ): Promise<Metric[]> {
    const conditions: string[] = ["metric_name = $1"];
    const values: any[] = [name];
    let paramIndex = 2;

    if (options.start_date) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(options.start_date);
      paramIndex++;
    }

    if (options.end_date) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(options.end_date);
      paramIndex++;
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex}` : "";
    if (options.limit) {
      values.push(options.limit);
    }

    const result = await query(
      `SELECT * FROM metrics WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC ${limitClause}`,
      values,
    );

    return result.rows.map((row) => ({
      name: row.metric_name,
      value: row.value,
      timestamp: row.timestamp,
      tags: row.tags,
    }));
  }

  /**
   * Log entry
   */
  async log(entry: LogEntry): Promise<void> {
    // Store in Redis for real-time monitoring
    const key = `logs:${entry.level}`;
    const value = JSON.stringify({
      message: entry.message,
      timestamp: entry.timestamp,
      context: entry.context,
      tags: entry.tags,
    });

    await redisService.set(key, value, 300); // 5 minutes TTL

    // Store in database for historical analysis
    await query(
      `INSERT INTO logs (level, message, timestamp, context, tags)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.level,
        entry.message,
        entry.timestamp,
        JSON.stringify(entry.context || {}),
        JSON.stringify(entry.tags || {}),
      ],
    );
  }

  /**
   * Get logs by level
   */
  async getLogs(
    level: string,
    options: {
      start_date?: Date;
      end_date?: Date;
      limit?: number;
    } = {},
  ): Promise<LogEntry[]> {
    const conditions: string[] = ["level = $1"];
    const values: any[] = [level];
    let paramIndex = 2;

    if (options.start_date) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(options.start_date);
      paramIndex++;
    }

    if (options.end_date) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(options.end_date);
      paramIndex++;
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex}` : "";
    if (options.limit) {
      values.push(options.limit);
    }

    const result = await query(
      `SELECT * FROM logs WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC ${limitClause}`,
      values,
    );

    return result.rows.map((row) => ({
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      context: row.context,
      tags: row.tags,
    }));
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<any> {
    const health = {
      status: "healthy",
      checks: {} as any,
      timestamp: new Date(),
    };

    // Check PostgreSQL
    try {
      await query("SELECT 1");
      health.checks.database = {
        status: "healthy",
        message: "Database connection successful",
      };
    } catch {
      health.checks.database = {
        status: "unhealthy",
        message: "Database connection failed",
      };
      health.status = "degraded";
    }

    // Check Redis
    try {
      const redisHealthy = await redisService.healthCheck();
      health.checks.redis = {
        status: redisHealthy ? "healthy" : "unhealthy",
        message: redisHealthy
          ? "Redis connection successful"
          : "Redis connection failed",
      };
      if (!redisHealthy) {
        health.status = "degraded";
      }
    } catch {
      health.checks.redis = {
        status: "unhealthy",
        message: "Redis connection failed",
      };
      health.status = "degraded";
    }

    return health;
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    // Get database performance
    const dbStats = await query(`
      SELECT 
        COUNT(*) as total_connections,
        COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections
      FROM pg_stat_activity
    `);

    // Get Redis performance
    const redisStats = await redisService.getStats();

    return {
      database: dbStats.rows[0],
      redis: redisStats,
      timestamp: new Date(),
    };
  }

  /**
   * Get error rate
   */
  async getErrorRate(minutes = 5): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_errors,
        level,
        COUNT(*) * 1.0 / (
          SELECT COUNT(*) FROM logs 
          WHERE timestamp >= NOW() - INTERVAL '${minutes} minutes'
        ) as error_rate
       FROM logs
       WHERE timestamp >= NOW() - INTERVAL '${minutes} minutes'
       GROUP BY level
       ORDER BY level`,
      [],
    );

    return result.rows;
  }

  /**
   * Get request statistics
   */
  async getRequestStatistics(minutes = 5): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms) as avg_response_time,
        MIN(response_time_ms) as min_response_time,
        MAX(response_time_ms) as max_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
       FROM api_logs
       WHERE timestamp >= NOW() - INTERVAL '${minutes} minutes'`,
      [],
    );

    return result.rows[0];
  }

  /**
   * Create alert
   */
  async createAlert(alert: {
    alert_type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    message: string;
    metadata?: any;
  }): Promise<void> {
    await query(
      `INSERT INTO alerts (alert_type, severity, message, metadata, status)
       VALUES ($1, $2, $3, $4, 'OPEN')`,
      [
        alert.alert_type,
        alert.severity,
        alert.message,
        JSON.stringify(alert.metadata || {}),
      ],
    );
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<any[]> {
    const result = await query(
      `SELECT * FROM alerts WHERE status IN ('OPEN', 'ACKNOWLEDGED') ORDER BY first_detected_at DESC`,
      [],
    );
    return result.rows;
  }

  /**
   * Track API request
   */
  async trackApiRequest(data: {
    endpoint: string;
    method: string;
    status_code: number;
    response_time_ms: number;
    user_id?: string;
  }): Promise<void> {
    await query(
      `INSERT INTO api_logs (endpoint, method, status_code, response_time_ms, user_id, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        data.endpoint,
        data.method,
        data.status_code,
        data.response_time_ms,
        data.user_id || null,
      ],
    );
  }
}

export const observabilityService = new ObservabilityService();
