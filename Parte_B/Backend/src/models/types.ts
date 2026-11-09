export type AgentState =
  | 'OFFLINE'
  | 'DISPONIBLE'
  | 'TIMBRANDO'
  | 'EN_LLAMADA'
  | 'WRAP_UP'
  | 'PAUSA';

export type CallState =
  | 'EN_COLA'
  | 'TIMBRANDO'
  | 'CONECTADA'
  | 'FINALIZADA'
  | 'ABANDONADA';

export interface Agent {
  id: string;
  name: string;
  extension: string;
  queues: string[];
  state: AgentState;
  stateChangedAt: string; // ISO 8601
  pauseReason?: string;
}

export interface Queue {
  id: string;
  name: string;
  maxWaitSeconds: number;
  noAnswerSeconds: number; // Segundos máximos de timbrado antes de disparar call.noanswer
}

export interface QueueMetrics {
  waitingCalls: number;
  attendedCalls: number;
  abandonedCalls: number;
  longestWaitSeconds: number;
}

export interface QueueWithMetrics extends Queue {
  metrics: QueueMetrics;
}

export interface Call {
  id: string;
  callerId: string;
  queue: string;
  state: CallState;
  timestamps: {
    incoming?: string;
    ringing?: string;
    connected?: string;
    ended?: string;
    abandoned?: string;
  };
  assignedAgentId?: string;
}

export interface EventPayload {
  eventId: string;
  ts: string;
  type: 'call.incoming' | 'call.answered' | 'call.hangup' | 'call.noanswer' | string;
  callId?: string;
  queue?: string;
  callerId?: string;
  agentId?: string;
}
