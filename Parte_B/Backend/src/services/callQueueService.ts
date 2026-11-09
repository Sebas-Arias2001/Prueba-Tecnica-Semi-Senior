import { Call, Queue, QueueMetrics, QueueWithMetrics } from '../models/types';
import { agentsStore, AgentService } from './agentService';
import { sseService } from './sseService';

export const queuesStore: Map<string, Queue> = new Map([
  ['soporte', { id: 'soporte', name: 'Cola de Soporte', maxWaitSeconds: 60 }],
  ['ventas', { id: 'ventas', name: 'Cola de Ventas', maxWaitSeconds: 60 }],
]);

export const callsStore: Map<string, Call> = new Map();

// Map de colas de espera: queueId -> array de callIds ordenados por llegada (FIFO)
export const waitingQueues: Map<string, string[]> = new Map([
  ['soporte', []],
  ['ventas', []],
]);

export class CallQueueService {
  static {
    // Registrar callback para cuando cualquier agente pasa a DISPONIBLE
    AgentService.registerAvailableCallback((agentId: string) => {
      CallQueueService.handleAgentBecameAvailable(agentId);
    });
  }

  static getQueues(): QueueWithMetrics[] {
    return Array.from(queuesStore.values()).map((q) => ({
      ...q,
      metrics: this.getQueueMetrics(q.id),
    }));
  }

  static getCalls(): Call[] {
    return Array.from(callsStore.values());
  }

  static getCall(id: string): Call | undefined {
    return callsStore.get(id);
  }

  // Cuando entra una nueva llamada
  static handleIncomingCall(
    callId: string,
    queueId: string,
    callerId: string,
    ts?: string
  ): { success: boolean; message: string; call?: Call } {
    // Validar si la llamada ya existe
    if (callsStore.has(callId)) {
      const existing = callsStore.get(callId)!;
      const msg = `[LOG RECHAZADO] La llamada ${callId} ya existe en estado ${existing.state}. Se ignora.`;
      console.warn(msg);
      return { success: false, message: msg, call: existing };
    }

    // Si la cola no existe, crearla dinámicamente o registrar error
    if (!queuesStore.has(queueId)) {
      queuesStore.set(queueId, {
        id: queueId,
        name: `Cola ${queueId}`,
        maxWaitSeconds: 60,
      });
      waitingQueues.set(queueId, []);
    }

    const incomingTime = ts || new Date().toISOString();
    const newCall: Call = {
      id: callId,
      callerId,
      queue: queueId,
      state: 'EN_COLA',
      timestamps: {
        incoming: incomingTime,
      },
    };

    callsStore.set(callId, newCall);

    if (!waitingQueues.has(queueId)) {
      waitingQueues.set(queueId, []);
    }
    waitingQueues.get(queueId)!.push(callId);

    console.log(
      `[LLAMADA] ${callId} de ${callerId} ingresó a la cola [${queueId}].`
    );

    // Intentar asignar inmediatamente si hay algún agente disponible
    this.tryAssignCall(queueId);

    // Notificar actualización en tiempo real
    sseService.broadcastUpdate({
      type: 'call_incoming',
      data: { call: callsStore.get(callId) },
    });

    return {
      success: true,
      message: 'Llamada ingresada a la cola',
      call: callsStore.get(callId),
    };
  }

  // Cuando se contesta una llamada (call.answered)
  static handleCallAnswered(
    callId: string,
    agentId: string,
    ts?: string
  ): { success: boolean; message: string } {
    const call = callsStore.get(callId);
    if (!call) {
      const msg = `[LOG RECHAZADO] Evento call.answered recibido para llamada inexistente ${callId}.`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    // Regla 3: Un evento que no aplica al estado actual (ej: llamada ya colgada o no timbrando) se registra y se ignora sin romper
    if (call.state !== 'TIMBRANDO') {
      const msg = `[LOG RECHAZADO] call.answered no aplica para llamada ${callId} en estado ${call.state}.`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    const agent = agentsStore.get(agentId);
    if (!agent) {
      const msg = `[LOG RECHAZADO] Agente ${agentId} no encontrado al contestar llamada ${callId}.`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    // Validar que el agente esté en TIMBRANDO
    if (agent.state !== 'TIMBRANDO') {
      const msg = `[LOG RECHAZADO] Agente ${agentId} no está en estado TIMBRANDO (estado actual: ${agent.state}).`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    const connectedTime = ts || new Date().toISOString();
    call.state = 'CONECTADA';
    call.timestamps.connected = connectedTime;
    call.assignedAgentId = agentId;
    callsStore.set(callId, call);

    // El agente pasa a EN_LLAMADA
    AgentService.changeState(agentId, 'EN_LLAMADA');

    console.log(
      `[LLAMADA] ${callId} contestada por agente ${agent.name} (${agentId}). Estado: CONECTADA`
    );

    sseService.broadcastUpdate({
      type: 'call_answered',
      data: { call, agentId },
    });

    return { success: true, message: 'Llamada conectada exitosamente' };
  }

  // Cuando se cuelga una llamada (call.hangup)
  static handleCallHangup(
    callId: string,
    ts?: string
  ): { success: boolean; message: string } {
    const call = callsStore.get(callId);
    if (!call) {
      const msg = `[LOG RECHAZADO] Evento call.hangup recibido para llamada inexistente ${callId}.`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    // Si ya estaba finalizada o abandonada, ignorar
    if (call.state === 'FINALIZADA' || call.state === 'ABANDONADA') {
      const msg = `[LOG RECHAZADO] call.hangup recibido para llamada ${callId} ya cerrada (${call.state}).`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    const hangupTime = ts || new Date().toISOString();
    const previousState = call.state;
    const assignedAgentId = call.assignedAgentId;

    if (previousState === 'EN_COLA' || previousState === 'TIMBRANDO') {
      // Si la llamada estaba en cola o timbrando, queda ABANDONADA
      call.state = 'ABANDONADA';
      call.timestamps.abandoned = hangupTime;

      // Si estaba en espera en la cola, removerla
      const qList = waitingQueues.get(call.queue);
      if (qList) {
        const idx = qList.indexOf(callId);
        if (idx !== -1) qList.splice(idx, 1);
      }

      // Si el agente estaba timbrando, vuelve a DISPONIBLE
      if (assignedAgentId) {
        const agent = agentsStore.get(assignedAgentId);
        if (agent && agent.state === 'TIMBRANDO') {
          console.log(
            `[COLGADA] Cliente colgó mientras timbraba. Agente ${assignedAgentId} vuelve a DISPONIBLE.`
          );
          AgentService.changeState(assignedAgentId, 'DISPONIBLE');
        }
      }
    } else if (previousState === 'CONECTADA') {
      // Si estaba conectada, queda FINALIZADA y el agente pasa a WRAP_UP
      call.state = 'FINALIZADA';
      call.timestamps.ended = hangupTime;

      if (assignedAgentId) {
        const agent = agentsStore.get(assignedAgentId);
        if (agent && agent.state === 'EN_LLAMADA') {
          console.log(
            `[COLGADA] Llamada ${callId} finalizada. Agente ${assignedAgentId} pasa a WRAP_UP.`
          );
          AgentService.changeState(assignedAgentId, 'WRAP_UP');
        }
      }
    }

    callsStore.set(callId, call);

    console.log(
      `[LLAMADA] ${callId} finalizada con estado [${call.state}] (previo: ${previousState}).`
    );

    sseService.broadcastUpdate({
      type: 'call_hangup',
      data: { call },
    });

    return {
      success: true,
      message: `Llamada finalizada como ${call.state}`,
    };
  }

  // Motor de asignación:
  // "cuando entra una llamada o un agente queda disponible, asigna la llamada más antigua de la cola al agente DISPONIBLE de esa cola que lleve más tiempo libre."
  static tryAssignCall(queueId: string): boolean {
    const queueList = waitingQueues.get(queueId);
    if (!queueList || queueList.length === 0) {
      return false;
    }

    // Buscar agentes en estado DISPONIBLE que pertenezcan a esta cola
    const availableAgents = Array.from(agentsStore.values()).filter(
      (agent) => agent.state === 'DISPONIBLE' && agent.queues.includes(queueId)
    );

    if (availableAgents.length === 0) {
      return false;
    }

    // Ordenar agentes por quien lleve más tiempo en estado DISPONIBLE (stateChangedAt más antiguo)
    availableAgents.sort(
      (a, b) =>
        new Date(a.stateChangedAt).getTime() -
        new Date(b.stateChangedAt).getTime()
    );

    const selectedAgent = availableAgents[0]!;

    // Tomar la llamada más antigua de la cola (FIFO: elemento 0)
    const callId = queueList.shift()!;
    const call = callsStore.get(callId);

    if (!call || call.state !== 'EN_COLA') {
      // Si por alguna razón la llamada ya no está en espera, continuar intentando
      return this.tryAssignCall(queueId);
    }

    // Asignación atómica en memoria
    call.state = 'TIMBRANDO';
    call.assignedAgentId = selectedAgent.id;
    call.timestamps.ringing = new Date().toISOString();
    callsStore.set(callId, call);

    // Cambiar estado del agente a TIMBRANDO
    AgentService.changeState(selectedAgent.id, 'TIMBRANDO');

    console.log(
      `[ASIGNACIÓN] Llamada ${callId} asignada al agente ${selectedAgent.name} (${selectedAgent.id}) en cola [${queueId}].`
    );

    sseService.broadcastUpdate({
      type: 'call_assigned',
      data: { call, agent: selectedAgent },
    });

    return true;
  }

  // Cuando un agente específico queda DISPONIBLE, buscar si hay llamadas en espera en sus colas
  static handleAgentBecameAvailable(agentId: string) {
    const agent = agentsStore.get(agentId);
    if (!agent || agent.state !== 'DISPONIBLE') return;

    // Buscar entre todas las colas del agente cuál tiene la llamada más antigua
    let oldestCall: Call | null = null;
    let targetQueueId: string | null = null;

    for (const qId of agent.queues) {
      const qList = waitingQueues.get(qId);
      if (qList && qList.length > 0) {
        const topCallId = qList[0]!;
        const c = callsStore.get(topCallId);
        if (c && c.state === 'EN_COLA' && c.timestamps.incoming) {
          if (
            !oldestCall ||
            new Date(c.timestamps.incoming).getTime() <
            new Date(oldestCall.timestamps.incoming!).getTime()
          ) {
            oldestCall = c;
            targetQueueId = qId;
          }
        }
      }
    }

    if (targetQueueId) {
      this.tryAssignCall(targetQueueId);
    }
  }

  // Métricas por cola: llamadas en espera, atendidas, abandonadas y la espera más larga en este momento
  static getQueueMetrics(queueId: string): QueueMetrics {
    const queueList = waitingQueues.get(queueId) || [];
    let attendedCount = 0;
    let abandonedCount = 0;
    let longestWaitSeconds = 0;

    const now = Date.now();

    // 1. Espera más larga en este momento:
    // Se calcula sobre las llamadas actualmente en espera (EN_COLA)
    for (const callId of queueList) {
      const call = callsStore.get(callId);
      if (call && call.timestamps.incoming) {
        const incomingTime = new Date(call.timestamps.incoming).getTime();
        const waitSec = Math.max(0, Math.floor((now - incomingTime) / 1000));
        if (waitSec > longestWaitSeconds) {
          longestWaitSeconds = waitSec;
        }
      }
    }

    // 2. Contar atendidas y abandonadas para esta cola
    callsStore.forEach((call) => {
      if (call.queue === queueId) {
        if (call.state === 'FINALIZADA' || call.state === 'CONECTADA') {
          attendedCount++;
        }
        if (call.state === 'ABANDONADA') {
          abandonedCount++;
        }
      }
    });

    return {
      waitingCalls: queueList.length,
      attendedCalls: attendedCount,
      abandonedCalls: abandonedCount,
      longestWaitSeconds,
    };
  }

  // Método auxiliar para testing (resetear stores)
  static _resetForTesting() {
    callsStore.clear();
    waitingQueues.set('soporte', []);
    waitingQueues.set('ventas', []);
  }
}
