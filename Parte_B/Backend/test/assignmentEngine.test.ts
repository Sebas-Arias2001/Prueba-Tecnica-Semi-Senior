import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AgentService, agentsStore } from '../src/services/agentService';
import {
  CallQueueService,
  callsStore,
  waitingQueues,
} from '../src/services/callQueueService';

describe('Motor de asignación y métricas de colas', () => {
  beforeEach(() => {
    AgentService._resetForTesting();
    CallQueueService._resetForTesting();
  });

  it('Asigna la llamada inmediatamente si hay un agente DISPONIBLE en esa cola', () => {
    // Loguear a-1001 (soporte, ventas)
    AgentService.changeState('a-1001', 'DISPONIBLE');

    CallQueueService.handleIncomingCall('c-101', 'soporte', '+573001112233');

    const call = callsStore.get('c-101');
    const agent = agentsStore.get('a-1001');

    assert.strictEqual(call?.state, 'TIMBRANDO');
    assert.strictEqual(call?.assignedAgentId, 'a-1001');
    assert.strictEqual(agent?.state, 'TIMBRANDO');
    assert.strictEqual(waitingQueues.get('soporte')?.length, 0);
  });

  it('Deja la llamada EN_COLA si no hay ningún agente disponible', () => {
    // Ambos agentes están OFFLINE
    CallQueueService.handleIncomingCall('c-102', 'soporte', '+573002223344');

    const call = callsStore.get('c-102');
    assert.strictEqual(call?.state, 'EN_COLA');
    assert.strictEqual(waitingQueues.get('soporte')?.length, 1);
    assert.strictEqual(waitingQueues.get('soporte')?.[0], 'c-102');
  });

  it('Asigna la llamada más antigua (FIFO) cuando un agente queda DISPONIBLE', () => {
    // Dos llamadas entran mientras no hay nadie
    CallQueueService.handleIncomingCall('c-first', 'soporte', '+573001', '2026-11-10T10:00:00Z');
    CallQueueService.handleIncomingCall('c-second', 'soporte', '+573002', '2026-11-10T10:05:00Z');

    assert.strictEqual(waitingQueues.get('soporte')?.length, 2);

    // Agente se loguea
    AgentService.changeState('a-1001', 'DISPONIBLE');

    // La llamada más antigua (c-first) debe haber sido asignada a a-1001
    const firstCall = callsStore.get('c-first');
    const secondCall = callsStore.get('c-second');

    assert.strictEqual(firstCall?.state, 'TIMBRANDO');
    assert.strictEqual(firstCall?.assignedAgentId, 'a-1001');
    assert.strictEqual(secondCall?.state, 'EN_COLA');
    assert.strictEqual(waitingQueues.get('soporte')?.length, 1);
  });

  it('Asigna al agente que lleve más tiempo libre en DISPONIBLE', () => {
    // Loguear dos agentes con diferente hora
    AgentService.changeState('a-1001', 'DISPONIBLE');
    agentsStore.get('a-1001')!.stateChangedAt = '2026-11-10T09:00:00Z'; // Más antiguo

    AgentService.changeState('a-1002', 'DISPONIBLE');
    agentsStore.get('a-1002')!.stateChangedAt = '2026-11-10T09:30:00Z'; // Más reciente

    CallQueueService.handleIncomingCall('c-103', 'soporte', '+573003');

    const call = callsStore.get('c-103');
    assert.strictEqual(call?.assignedAgentId, 'a-1001');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'TIMBRANDO');
    assert.strictEqual(agentsStore.get('a-1002')?.state, 'DISPONIBLE');
  });

  it('Una llamada no puede asignarse a dos agentes y un agente no recibe dos llamadas', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');

    // Primera llamada
    CallQueueService.handleIncomingCall('c-1', 'soporte', '+573001');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'TIMBRANDO');

    // Segunda llamada mientras a-1001 ya está timbrando
    CallQueueService.handleIncomingCall('c-2', 'soporte', '+573002');

    // c-2 no puede asignarse a a-1001 porque a-1001 ya no está DISPONIBLE
    const call2 = callsStore.get('c-2');
    assert.strictEqual(call2?.state, 'EN_COLA');
    assert.strictEqual(call2?.assignedAgentId, undefined);
  });

  it('Calcula correctamente las métricas de cola (en espera, atendidas, abandonadas, espera más larga)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');

    // Llamada 1: contestada y finalizada
    CallQueueService.handleIncomingCall('c-att', 'soporte', '+57301');
    CallQueueService.handleCallAnswered('c-att', 'a-1001');
    CallQueueService.handleCallHangup('c-att');

    // Llamada 2: abandonada en cola
    // El agente debe estar en DISPONIBLE para poder pausarse (viene de WRAP_UP -> auto DISPONIBLE en test no espera)
    // Forzamos DISPONIBLE directamente para el test
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'PAUSA');
    CallQueueService.handleIncomingCall('c-abn', 'soporte', '+57302');
    CallQueueService.handleCallHangup('c-abn');

    // Llamada 3: actualmente en espera
    CallQueueService.handleIncomingCall('c-wait', 'soporte', '+57303');

    const metrics = CallQueueService.getQueueMetrics('soporte');
    assert.strictEqual(metrics.waitingCalls, 1);
    assert.strictEqual(metrics.attendedCalls, 1);
    assert.strictEqual(metrics.abandonedCalls, 1);
    assert.ok(metrics.longestWaitSeconds >= 0);
  });

  it('Marca la llamada como ABANDONADA y la remueve de la cola al vencerse el tiempo máximo de espera', () => {
    // Ningún agente conectado, la llamada entra a soporte
    CallQueueService.handleIncomingCall('c-timeout-1', 'soporte', '+573009998877');

    const callBefore = callsStore.get('c-timeout-1');
    assert.strictEqual(callBefore?.state, 'EN_COLA');
    assert.strictEqual(waitingQueues.get('soporte')?.includes('c-timeout-1'), true);

    // Disparamos la expiración del tiempo máximo de espera de forma explícita
    const result = CallQueueService.handleMaxWaitTimeout('c-timeout-1');
    assert.strictEqual(result.success, true);

    // 1. La llamada debe cambiar su estado a ABANDONADA
    const callAfter = callsStore.get('c-timeout-1');
    assert.strictEqual(callAfter?.state, 'ABANDONADA');
    assert.ok(callAfter?.timestamps.abandoned);

    // 2. Ya no debe figurar en la lista de espera de la cola
    assert.strictEqual(waitingQueues.get('soporte')?.includes('c-timeout-1'), false);

    // 3. La métrica de abandonadas de la cola debe reflejarla
    const metrics = CallQueueService.getQueueMetrics('soporte');
    assert.strictEqual(metrics.abandonedCalls, 1);
    assert.strictEqual(metrics.waitingCalls, 0);
  });
});

