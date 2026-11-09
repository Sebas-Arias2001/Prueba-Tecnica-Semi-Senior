import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AgentService, agentsStore } from '../src/services/agentService';

describe('Máquina de estados de los agentes (10 transiciones estrictas)', () => {
  beforeEach(() => {
    AgentService._resetForTesting();
  });

  it('Transición 1: OFFLINE -> DISPONIBLE (login)', () => {
    const res = AgentService.changeState('a-1001', 'DISPONIBLE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'DISPONIBLE');
  });

  it('Transición 2: DISPONIBLE -> OFFLINE (logout)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    const res = AgentService.changeState('a-1001', 'OFFLINE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'OFFLINE');
  });

  it('Transición 3: DISPONIBLE -> TIMBRANDO (llamada asignada)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    const res = AgentService.changeState('a-1001', 'TIMBRANDO');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'TIMBRANDO');
  });

  it('Transición 4: TIMBRANDO -> DISPONIBLE (cliente cuelga)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'TIMBRANDO');
    const res = AgentService.changeState('a-1001', 'DISPONIBLE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'DISPONIBLE');
  });

  it('Transición 5: TIMBRANDO -> EN_LLAMADA (call.answered)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'TIMBRANDO');
    const res = AgentService.changeState('a-1001', 'EN_LLAMADA');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'EN_LLAMADA');
  });

  it('Transición 6: EN_LLAMADA -> WRAP_UP (call.hangup)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'TIMBRANDO');
    AgentService.changeState('a-1001', 'EN_LLAMADA');
    const res = AgentService.changeState('a-1001', 'WRAP_UP');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'WRAP_UP');
  });

  it('Transición 7: WRAP_UP -> DISPONIBLE', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'TIMBRANDO');
    AgentService.changeState('a-1001', 'EN_LLAMADA');
    AgentService.changeState('a-1001', 'WRAP_UP');
    const res = AgentService.changeState('a-1001', 'DISPONIBLE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'DISPONIBLE');
  });

  it('Transición 8: DISPONIBLE -> PAUSA (con motivo)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    const res = AgentService.changeState('a-1001', 'PAUSA', 'Almuerzo');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'PAUSA');
    assert.strictEqual(agentsStore.get('a-1001')?.pauseReason, 'Almuerzo');
  });

  it('Transición 9: PAUSA -> DISPONIBLE (despausar)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'PAUSA', 'Capacitación');
    const res = AgentService.changeState('a-1001', 'DISPONIBLE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'DISPONIBLE');
    assert.strictEqual(agentsStore.get('a-1001')?.pauseReason, undefined);
  });

  it('Transición 10: PAUSA -> OFFLINE (logout)', () => {
    AgentService.changeState('a-1001', 'DISPONIBLE');
    AgentService.changeState('a-1001', 'PAUSA', 'Fin de turno');
    const res = AgentService.changeState('a-1001', 'OFFLINE');
    assert.strictEqual(res.success, true);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'OFFLINE');
  });

  it('Rechaza transiciones inválidas y mantiene estado previo', () => {
    // a-1001 inicia en OFFLINE
    const res1 = AgentService.changeState('a-1001', 'EN_LLAMADA');
    assert.strictEqual(res1.success, false);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'OFFLINE');

    const res2 = AgentService.changeState('a-1001', 'TIMBRANDO');
    assert.strictEqual(res2.success, false);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'OFFLINE');

    // Pasar a DISPONIBLE y probar salto directo a WRAP_UP
    AgentService.changeState('a-1001', 'DISPONIBLE');
    const res3 = AgentService.changeState('a-1001', 'WRAP_UP');
    assert.strictEqual(res3.success, false);
    assert.strictEqual(agentsStore.get('a-1001')?.state, 'DISPONIBLE');
  });
});

