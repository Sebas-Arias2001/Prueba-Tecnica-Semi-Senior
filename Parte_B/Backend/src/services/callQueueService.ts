import { Call, Queue } from '../models/types';
import { agentsStore, AgentService } from './agentService';

export const queuesStore: Map<string, Queue> = new Map([
  ['soporte', { id: 'soporte', name: 'Cola de Soporte', maxWaitSeconds: 60 }],
  ['ventas', { id: 'ventas', name: 'Cola de Ventas', maxWaitSeconds: 60 }]
]);

export const callsStore: Map<string, Call> = new Map();
export const waitingQueues: Map<string, string[]> = new Map([
  ['soporte', []],
  ['ventas', []]
]);

export class CallQueueService {

  static handleIncomingCall(callId: string, queueId: string, callerId: string): Call {
    const now = new Date().toISOString();
    const newCall: Call = {
      id: callId,
      callerId,
      queue: queueId,
      state: 'EN_COLA',
      timestamps: { incoming: now }
    };

    callsStore.set(callId, newCall);
    
    // Agregar a la cola respectiva
    if (!waitingQueues.has(queueId)) {
      waitingQueues.set(queueId, []);
    }
    waitingQueues.get(queueId)!.push(callId);

    // Intentar asignar inmediatamente si hay agentes disponibles
    this.tryAssignCall(queueId);

    return newCall;
  }

  static tryAssignCall(queueId: string) {
    const queueList = waitingQueues.get(queueId);
    if (!queueList || queueList.length === 0) return;

    // Buscar agentes DISPONIBLES que pertenezcan a esta cola
    const availableAgents = Array.from(agentsStore.values()).filter(
      agent => agent.state === 'DISPONIBLE' && agent.queues.includes(queueId)
    );

    if (availableAgents.length === 0) return;

    // Ordenar agentes por el que lleve más tiempo libre en estado DISPONIBLE (estado más antiguo)
    availableAgents.sort((a, b) => new Date(a.stateChangedAt).getTime() - new Date(b.stateChangedAt).getTime());

    // Tomar la llamada más antigua de la cola (FIFO)
    const callId = queueList[0];
    const call = callsStore.get(callId);
    const selectedAgent = availableAgents[0];

    if (call && selectedAgent) {
      // Remover de la cola de espera
      queueList.shift();

      // Cambiar estados
      call.state = 'TIMBRANDO';
      call.assignedAgentId = selectedAgent.id;
      call.timestamps.ringing = new Date().toISOString();
      callsStore.set(callId, call);

      // Pasar agente a TIMBRANDO
      AgentService.changeState(selectedAgent.id, 'TIMBRANDO');
    }
  }

  static handleCallAnswered(callId: string, agentId: string) {
    const call = callsStore.get(callId);
    if (!call) return;

    call.state = 'CONECTADA';
    call.timestamps.connected = new Date().toISOString();
    callsStore.set(callId, call);

    // Pasar agente a EN_LLAMADA
    AgentService.changeState(agentId, 'EN_LLAMADA');
  }

  static handleCallHangup(callId: string) {
    const call = callsStore.get(callId);
    if (!call) return;

    const previousState = call.state;
    const now = new Date().toISOString();

    if (previousState === 'EN_COLA' || previousState === 'TIMBRANDO') {
      call.state = 'ABANDONADA';
      call.timestamps.abandoned = now;

      // Si estaba timbrando a un agente, devolverlo a DISPONIBLE
      if (call.assignedAgentId) {
        AgentService.changeState(call.assignedAgentId, 'DISPONIBLE');
      }
    } else if (previousState === 'CONECTADA') {
      call.state = 'FINALIZADA';
      call.timestamps.ended = now;

      // Si había un agente asignado, pasarlo a WRAP_UP (que activará los 15s automáticos)
      if (call.assignedAgentId) {
        AgentService.changeState(call.assignedAgentId, 'WRAP_UP');
      }
    }

    callsStore.set(callId, call);
  }

  // Obtener métricas por cola que pide la prueba
  static getQueueMetrics(queueId: string) {
    const queueList = waitingQueues.get(queueId) || [];
    let attendedCount = 0;
    let abandonedCount = 0;
    let maxWaitSeconds = 0;

    callsStore.forEach(call => {
      if (call.queue === queueId) {
        if (call.state === 'FINALIZADA') attendedCount++;
        if (call.state === 'ABANDONADA') abandonedCount++;
        
        // Calcular espera más larga actual o histórica
        if (call.timestamps.incoming && (call.timestamps.ringing || call.timestamps.abandoned)) {
          const start = new Date(call.timestamps.incoming).getTime();
          const end = new Date(call.timestamps.ringing || call.timestamps.abandoned || '').getTime();
          const diff = Math.floor((end - start) / 1000);
          if (diff > maxWaitSeconds) maxWaitSeconds = diff;
        }
      }
    });

    return {
      waitingCalls: queueList.length,
      attendedCalls: attendedCount,
      abandonedCalls: abandonedCount,
      longestWaitSeconds: maxWaitSeconds
    };
  }
}