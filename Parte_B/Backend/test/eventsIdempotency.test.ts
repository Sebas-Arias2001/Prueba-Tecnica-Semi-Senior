import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AgentService, agentsStore } from '../src/services/agentService';
import {
  CallQueueService,
  callsStore,
  waitingQueues,
} from '../src/services/callQueueService';
import {
  EventController,
  processedEvents,
} from '../src/controllers/eventController';

describe('Idempotencia de eventos y flujo de secuencia oficial', () => {
  beforeEach(() => {
    AgentService._resetForTesting();
    CallQueueService._resetForTesting();
    EventController._resetForTesting();
  });

  it('Ejecuta exactamente la secuencia de ejemplo del documento oficial', () => {
    // 1. Loguear a-1001 para que pueda recibir llamadas
    AgentService.changeState('a-1001', 'DISPONIBLE');

    // Simular req y res para controller
    const mockRes = () => {
      let statusCode = 200;
      let bodyData: any = null;
      return {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              bodyData = data;
              return data;
            },
          };
        },
        json: (data: any) => {
          bodyData = data;
          return data;
        },
        getData: () => bodyData,
        getCode: () => statusCode,
      };
    };

    // Evento 1: call.incoming
    const res1 = mockRes();
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-001',
          ts: '2026-11-10T14:00:00Z',
          type: 'call.incoming',
          callId: 'c-001',
          queue: 'soporte',
          callerId: '+573001112233',
        },
      } as any,
      res1 as any
    );

    assert.strictEqual(callsStore.get('c-001')?.state, 'TIMBRANDO');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'TIMBRANDO');

    // Evento 2: call.answered
    const res2 = mockRes();
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-002',
          ts: '2026-11-10T14:00:06Z',
          type: 'call.answered',
          callId: 'c-001',
          agentId: 'a-1001',
        },
      } as any,
      res2 as any
    );

    assert.strictEqual(callsStore.get('c-001')?.state, 'CONECTADA');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'EN_LLAMADA');

    // Evento 3: e-002 duplicado a propósito
    const res3 = mockRes();
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-002',
          ts: '2026-11-10T14:00:06Z',
          type: 'call.answered',
          callId: 'c-001',
          agentId: 'a-1001',
        },
      } as any,
      res3 as any
    );

    const data3 = res3.getData();
    assert.strictEqual(data3.result?.status, 'ignored_duplicate');
    assert.strictEqual(callsStore.get('c-001')?.state, 'CONECTADA');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'EN_LLAMADA');

    // Evento 4: call.hangup
    const res4 = mockRes();
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-003',
          ts: '2026-11-10T14:04:31Z',
          type: 'call.hangup',
          callId: 'c-001',
        },
      } as any,
      res4 as any
    );

    assert.strictEqual(callsStore.get('c-001')?.state, 'FINALIZADA');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'WRAP_UP');
  });

  it('Ignora de forma segura un evento call.answered para una llamada ya colgada o inexistente', () => {
    const mockRes = () => {
      let bodyData: any = null;
      return {
        status: () => ({
          json: (data: any) => {
            bodyData = data;
          },
        }),
        json: (data: any) => {
          bodyData = data;
        },
        getData: () => bodyData,
      };
    };

    const res = mockRes();
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-orphan',
          ts: '2026-11-10T14:00:00Z',
          type: 'call.answered',
          callId: 'c-non-existent',
          agentId: 'a-1001',
        },
      } as any,
      res as any
    );

    // No debe lanzar error ni romper el servicio
    assert.strictEqual(processedEvents.has('e-orphan'), true);
    assert.strictEqual(res.getData().result.status, 'ignored');
  });

  it('Soporta lotes (batch) de eventos en un solo POST', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');

    let bodyData: any = null;
    const res = {
      status: () => ({
        json: (d: any) => {
          bodyData = d;
        },
      }),
      json: (d: any) => {
        bodyData = d;
      },
    };

    const batch = [
      {
        eventId: 'b-001',
        ts: '2026-11-10T14:00:00Z',
        type: 'call.incoming',
        callId: 'c-b1',
        queue: 'soporte',
        callerId: '+57300999',
      },
      {
        eventId: 'b-002',
        ts: '2026-11-10T14:00:05Z',
        type: 'call.answered',
        callId: 'c-b1',
        agentId: 'a-1001',
      },
    ];

    EventController.handleEvent({ body: batch } as any, res as any);

    assert.strictEqual(bodyData.results.length, 2);
    assert.strictEqual(callsStore.get('c-b1')?.state, 'CONECTADA');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'EN_LLAMADA');
  });

  it('Procesa evento call.noanswer: agente pasa a PAUSA y la llamada vuelve al inicio de la cola', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');

    // Entra llamada c-noans y se asigna a a-1001 (TIMBRANDO)
    CallQueueService.handleIncomingCall('c-noans', 'soporte', '+57300555');
    assert.strictEqual(callsStore.get('c-noans')?.state, 'TIMBRANDO');
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'TIMBRANDO');

    // Entra otra llamada c-behind que queda en espera
    CallQueueService.handleIncomingCall('c-behind', 'soporte', '+57300777');
    assert.strictEqual(waitingQueues.get('soporte')?.[0], 'c-behind');

    let bodyData: any = null;
    const res = {
      status: () => ({
        json: (d: any) => { bodyData = d; },
      }),
      json: (d: any) => { bodyData = d; },
    };

    // Disparamos evento call.noanswer
    EventController.handleEvent(
      {
        body: {
          eventId: 'e-noans-1',
          ts: '2026-11-10T14:00:20Z',
          type: 'call.noanswer',
          callId: 'c-noans',
        },
      } as any,
      res as any
    );

    // 1. Agente pasa a PAUSA con motivo 'No contesta'
    const agent = agentsStore.get('a-1001');
    assert.strictEqual(agent?.state, 'PAUSA');
    assert.strictEqual(agent?.pauseReason, 'No contesta');

    // 2. La llamada c-noans vuelve al estado EN_COLA
    const call = callsStore.get('c-noans');
    assert.strictEqual(call?.state, 'EN_COLA');
    assert.strictEqual(call?.assignedAgentId, undefined);

    // 3. La llamada c-noans está en el inicio de la cola (unshift), delante de c-behind
    const queueList = waitingQueues.get('soporte');
    assert.strictEqual(queueList?.[0], 'c-noans');
    assert.strictEqual(queueList?.[1], 'c-behind');
  });
});

