import { FastifyInstance } from "fastify";
import { z } from "zod";
import { securityIncidentService } from "../services/securityIncidentService.js";

export async function securityIncidentRoutes(fastify: FastifyInstance) {
  // Security Incidents: Create incident
  fastify.post("/security-incidents", async (request, reply) => {
    const schema = z.object({
      incident_type: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      affected_entity_type: z.string().optional(),
      affected_entity_id: z.string().uuid().optional(),
      affected_user_id: z.string().optional(),
      description: z.string(),
      technical_details: z.any().optional(),
      reported_by: z.string().optional(),
    });

    const incidentData = schema.parse(request.body);

    try {
      const incident =
        await securityIncidentService.createIncident(incidentData);
      return reply.status(201).send(incident);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create security incident" });
    }
  });

  // Security Incidents: Get incident
  fastify.get("/security-incidents/:incidentId", async (request, reply) => {
    const schema = z.object({
      incidentId: z.string(),
    });

    const { incidentId } = schema.parse(request.params);

    try {
      const incident = await securityIncidentService.getIncident(incidentId);
      if (!incident) {
        return reply.status(404).send({ error: "Security incident not found" });
      }
      return reply.send(incident);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get security incident" });
    }
  });

  // Security Incidents: Get by status
  fastify.get("/security-incidents/status/:status", async (request, reply) => {
    const schema = z.object({
      status: z.string(),
    });

    const { status } = schema.parse(request.params);

    try {
      const incidents =
        await securityIncidentService.getIncidentsByStatus(status);
      return reply.send(incidents);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get security incidents by status" });
    }
  });

  // Security Incidents: Get by severity
  fastify.get(
    "/security-incidents/severity/:severity",
    async (request, reply) => {
      const schema = z.object({
        severity: z.string(),
      });

      const { severity } = schema.parse(request.params);

      try {
        const incidents =
          await securityIncidentService.getIncidentsBySeverity(severity);
        return reply.send(incidents);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get security incidents by severity" });
      }
    },
  );

  // Security Incidents: Get open incidents
  fastify.get("/security-incidents/open", async (request, reply) => {
    try {
      const incidents = await securityIncidentService.getOpenIncidents();
      return reply.send(incidents);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get open security incidents" });
    }
  });

  // Security Incidents: Update status
  fastify.put(
    "/security-incidents/:incidentId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        incidentId: z.string(),
      });

      const bodySchema = z.object({
        status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]),
        resolution_notes: z.string().optional(),
        assigned_to: z.string().optional(),
      });

      const { incidentId } = paramsSchema.parse(request.params);
      const statusData = bodySchema.parse(request.body);

      try {
        const incident = await securityIncidentService.updateIncidentStatus(
          incidentId,
          statusData.status,
          statusData,
        );
        return reply.send(incident);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Security incident not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update incident status" });
      }
    },
  );

  // Security Incidents: Assign incident
  fastify.post(
    "/security-incidents/:incidentId/assign",
    async (request, reply) => {
      const paramsSchema = z.object({
        incidentId: z.string(),
      });

      const bodySchema = z.object({
        assigned_to: z.string(),
      });

      const { incidentId } = paramsSchema.parse(request.params);
      const { assigned_to } = bodySchema.parse(request.body);

      try {
        const incident = await securityIncidentService.assignIncident(
          incidentId,
          assigned_to,
        );
        return reply.send(incident);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Security incident not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Failed to assign incident" });
      }
    },
  );

  // Security Incidents: Get statistics
  fastify.get("/security-incidents/statistics", async (request, reply) => {
    try {
      const stats = await securityIncidentService.getStatistics();
      return reply.send(stats);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get security incident statistics" });
    }
  });
}
