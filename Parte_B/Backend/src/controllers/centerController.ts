import type { Request, Response } from 'express';
import { AgentService } from '../services/agentService';
import { CallQueueService } from '../services/callQueueService';

export class CenterController {
  // Listar los agentes y sus estados actuales
  static getAgents(_req: Request, res: Response) {
    const agents = AgentService.getAgents();
    res.json(agents);
  }

  // Listar las colas y sus métricas actuales
  static getQueues(_req: Request, res: Response) {
    const queues = CallQueueService.getQueues();
    res.json(queues);
  }

  // Login de agente (cambiar estado OFFLINE a DISPONIBLE)
  static loginAgent(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = AgentService.changeState(id, 'DISPONIBLE');
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }

  // Logout de agente (cambiar estado a OFFLINE)
  static logoutAgent(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = AgentService.changeState(id, 'OFFLINE');
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }

  // Pausar agente (cambiar estado a PAUSA)
  static pauseAgent(req: Request, res: Response) {
    const id = String(req.params.id);
    const { reason } = req.body || {};
    const result = AgentService.changeState(
      id,
      'PAUSA',
      reason || 'Pausa operativa'
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }

  // Despausar agente (cambiar estado a DISPONIBLE)
  static unpauseAgent(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = AgentService.changeState(id, 'DISPONIBLE');
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }
}
