import { Agent, AgentState } from '../models/types';
import { sseService } from './sseService';

// Base de datos en memoria para agentes
export const agentsStore: Map<string, Agent> = new Map([
  [
    'a-1001',
    {
      id: 'a-1001',
      name: 'Carlos Pérez',
      extension: '1001',
      queues: ['soporte', 'ventas'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    },
  ],
  [
    'a-1002',
    {
      id: 'a-1002',
      name: 'Ana Gómez',
      extension: '1002',
      queues: ['soporte'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    },
  ],
  [
    'a-1003',
    {
      id: 'a-1003',
      name: 'Juan Rodríguez',
      extension: '1003',
      queues: ['ventas'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    },
  ],
]);

// Mapa para rastrear los timers de wrap_up automáticos de 15s
const wrapUpTimers: Map<string, NodeJS.Timeout> = new Map();

// Solo estas transiciones son válidas según el diagrama oficial + extensión call.noanswer
const validTransitions: Record<AgentState, AgentState[]> = {
  OFFLINE: ['DISPONIBLE'],
  DISPONIBLE: ['OFFLINE', 'TIMBRANDO', 'PAUSA'],
  TIMBRANDO: ['DISPONIBLE', 'EN_LLAMADA', 'PAUSA'], // PAUSA agregado para call.noanswer
  EN_LLAMADA: ['WRAP_UP'],
  WRAP_UP: ['DISPONIBLE'],
  PAUSA: ['DISPONIBLE', 'OFFLINE'],
};

// Callback para resolver dependencia circular con CallQueueService
let onAgentBecameAvailable: ((agentId: string) => void) | null = null;

export class AgentService {
  static registerAvailableCallback(callback: (agentId: string) => void) {
    onAgentBecameAvailable = callback;
  }

  static getAgents(): Agent[] {
    return Array.from(agentsStore.values());
  }

  static getAgent(id: string): Agent | undefined {
    return agentsStore.get(id);
  }

  static changeState(
    agentId: string,
    targetState: AgentState,
    pauseReason?: string
  ): { success: boolean; message: string; agent?: Agent } {
    const agent = agentsStore.get(agentId);
    if (!agent) {
      const msg = `[LOG RECHAZADO] Agente con ID ${agentId} no encontrado.`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    const currentState = agent.state;

    // Validación estricta de las 10 transiciones permitidas
    const allowed = validTransitions[currentState]?.includes(targetState);
    if (!allowed && currentState !== targetState) {
      const msg = `[LOG RECHAZADO] Transición inválida para agente ${agentId}: de [${currentState}] a [${targetState}]`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    // Limpiar timer previo de wrap_up si existía
    if (wrapUpTimers.has(agentId)) {
      clearTimeout(wrapUpTimers.get(agentId)!);
      wrapUpTimers.delete(agentId);
    }

    // Aplicar cambio de estado
    agent.state = targetState;
    agent.stateChangedAt = new Date().toISOString();

    if (targetState === 'PAUSA') {
      agent.pauseReason = pauseReason || 'Pausa operativa';
    } else {
      delete agent.pauseReason;
    }

    agentsStore.set(agentId, agent);
    console.log(
      `[AGENTE] ${agent.name} (${agentId}) cambió de [${currentState}] a [${targetState}]`
    );

    // Si entra en WRAP_UP, programar el retorno automático a DISPONIBLE tras 15 segundos
    if (targetState === 'WRAP_UP') {
      const timer = setTimeout(() => {
        const currentAgent = agentsStore.get(agentId);
        if (currentAgent && currentAgent.state === 'WRAP_UP') {
          console.log(
            `[AUTOMÁTICO] Agente ${agentId} cumplió 15s de WRAP_UP. Retornando a DISPONIBLE.`
          );
          AgentService.changeState(agentId, 'DISPONIBLE');
        }
      }, 15000);
      if (timer.unref) {
        timer.unref();
      }
      wrapUpTimers.set(agentId, timer);
    }

    // Notificar cambios en tiempo real vía SSE
    sseService.broadcastUpdate({
      type: 'agent_state_changed',
      data: { agentId, state: targetState, agent },
    });

    // Si el agente quedó DISPONIBLE, intentar asignarle llamadas pendientes
    if (targetState === 'DISPONIBLE' && onAgentBecameAvailable) {
      // Diferir ligeramente o ejecutar inmediatamente para asignar
      onAgentBecameAvailable(agentId);
    }

    return {
      success: true,
      message: `Estado actualizado a ${targetState}`,
      agent,
    };
  }

  // Método auxiliar para testing (resetear stores y timers)
  static _resetForTesting() {
    wrapUpTimers.forEach((timer) => clearTimeout(timer));
    wrapUpTimers.clear();
    agentsStore.set('a-1001', {
      id: 'a-1001',
      name: 'Carlos Pérez',
      extension: '1001',
      queues: ['soporte', 'ventas'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    });
    agentsStore.set('a-1002', {
      id: 'a-1002',
      name: 'Ana Gómez',
      extension: '1002',
      queues: ['soporte'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    });
    agentsStore.set('a-1003', {
      id: 'a-1003',
      name: 'Juan Rodríguez',
      extension: '1003',
      queues: ['ventas'],
      state: 'OFFLINE',
      stateChangedAt: new Date().toISOString(),
    });
  }
}
