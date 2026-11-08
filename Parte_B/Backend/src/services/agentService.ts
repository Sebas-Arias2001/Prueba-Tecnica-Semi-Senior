import { Agent, AgentState } from '../models/types';

// Base de datos en memoria para agentes y colas (simulada)
export const agentsStore: Map<String, Agent> = new Map([
  ['a-1001', { id: 'a-1001', name: 'Carlos Pérez', extension: '1001', queues: ['soporte', 'ventas'], state: 'OFFLINE', stateChangedAt: new Date().toISOString() }],
  ['a-1002', { id: 'a-1002', name: 'Ana Gómez', extension: '1002', queues: ['soporte'], state: 'OFFLINE', stateChangedAt: new Date().toISOString() }]
]);

// Mapa para rastrear los timers de wrap_up automáticos de 15s
const wrapUpTimers: Map<string, NodeJS.Timeout> = new Map();

// Transiciones válidas según el diagrama oficial de la prueba
const validTransitions: Record<AgentState, AgentState[]> = {
  OFFLINE: ['DISPONIBLE'],
  DISPONIBLE: ['OFFLINE', 'TIMBRANDO', 'PAUSA'],
  TIMBRANDO: ['DISPONIBLE', 'EN_LLAMADA'], // Si el cliente cuelga o no contesta vuelve a DISPONIBLE
  EN_LLAMADA: ['WRAP_UP', 'ABANDONADA' as any, 'FINALIZADA' as any],
  WRAP_UP: ['DISPONIBLE'], // Vuelve solo a DISPONIBLE (o por timer)
  PAUSA: ['DISPONIBLE', 'OFFLINE']
};

export class AgentService {
  
  static changeState(agentId: string, targetState: AgentState, pauseReason?: string): { success: boolean; message: string; agent?: Agent } {
    const agent = agentsStore.get(agentId);
    if (!agent) {
      return { success: false, message: `Agente con ID ${agentId} no encontrado.` };
    }

    const currentState = agent.state;

    // Validación estricta de transiciones
    const allowed = validTransitions[currentState]?.includes(targetState);
    if (!allowed && currentState !== targetState) {
      console.warn(`[LOG RECHAZADO] Transición inválida para agente ${agentId}: de [${currentState}] a [${targetState}]`);
      return { success: false, message: `Transición no permitida de ${currentState} a ${targetState}` };
    }

    // Limpiar timer de wrap_up si existía y el agente cambia de estado por otra razón
    if (wrapUpTimers.has(agentId)) {
      clearTimeout(wrapUpTimers.get(agentId)!);
      wrapUpTimers.delete(agentId);
    }

    // Aplicar cambio de estado
    agent.state = targetState;
    agent.stateChangedAt = new Date().toISOString();
    if (pauseReason) {
      agent.pauseReason = pauseReason;
    } else if (targetState !== 'PAUSA') {
      delete agent.pauseReason;
    }

    agentsStore.set(agentId, agent);

    // Si entra en WRAP_UP, programar el retorno automático a DISPONIBLE en 15 segundos
    if (targetState === 'WRAP_UP') {
      const timer = setTimeout(() => {
        const currentAgent = agentsStore.get(agentId);
        if (currentAgent && currentAgent.state === 'WRAP_UP') {
          this.changeState(agentId, 'DISPONIBLE');
          console.log(`[AUTOMÁTICO] Agente ${agentId} pasó de WRAP_UP a DISPONIBLE tras 15 segundos.`);
        }
      }, 15000); // 15 segundos exactos que pide la regla
      wrapUpTimers.set(agentId, timer);
    }

    return { success: true, message: `Estado actualizado correctamente a ${targetState}`, agent };
  }
}