import type { Request, Response } from "express";
import { agentsStore, AgentService } from "../services/agentService";
import { queuesStore, CallQueueService } from "../services/callQueueService";

export class CenterController {
  // Listar los agentes y sus estados actuales
  static getAgents(req: Request, res: Response) {
    const agents = Array.from(agentsStore.values());
    res.json(agents);
  }

  // Listar las colas y sus metricas actuales
  static getQueues(req: Request, res: Response) {
    const queuesResponse = Array.from(queuesStore.values()).map((queue) => {
      const metrics = CallQueueService.getQueueMetrics(queue.id);
      return {
        ...queue,
        metrics,
      };
    });
    res.json(queuesResponse);
  }

  // Login de agente (cambiar estado OFFLINE a DISPONIBLE)
  static LoginAgent(req: Request, res: Response) {
    const { id } = req.params;
    const result = AgentService.changeState(id, "DISPONIBLE");
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Si el agente tiene colas asignadas, intentar asignarle llamadas pendientes
    const agent = agentsStore.get(id);
    if (agent && agent.queues) {
      agent.queues.forEach((qId) => CallQueueService.tryAssignCall(qId));
    }
    res.json(result);
  }

  // Logout de agente (cambiar estado a OFFLINE)
  static logoutAgent(req: Request, res: Response) {
    const { id } = req.params;
    const result = AgentService.changeState(id, "OFFLINE");
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  }

  // Pausar agente (cambiar estado a PAUSA)
  static pauseAgent(req: Request, res: Response) {
    const { id } = req.params;
    const { reason } = req.body;
    const result = AgentService.changeState(
      id,
      "PAUSA",
      reason || "Pausado por el usuario",
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  }

  // Despausar agente (cambiar estado a DISPONIBLE)
  static unpauseAgent(req: Request, res: Response) {
    const { id } = req.params;
    const result = AgentService.changeState(id, "DISPONIBLE");
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Si el agente tiene colas asignadas, intentar asignarle llamadas pendientes
    const agent = agentsStore.get(id);
    if (agent && agent.queues) {
      agent.queues.forEach((qId) => CallQueueService.tryAssignCall(qId));
    }
    res.json(result);
  }
}
