import { useEffect, useState, useRef, useCallback } from 'react';

const API_BASE_URL = 'http://localhost:3000/api';

interface Agent {
  id: string;
  name: string;
  extension: string;
  queues: string[];
  state: 'OFFLINE' | 'DISPONIBLE' | 'TIMBRANDO' | 'EN_LLAMADA' | 'WRAP_UP' | 'PAUSA';
  stateChangedAt: string;
  pauseReason?: string;
}

interface QueueMetrics {
  waitingCalls: number;
  attendedCalls: number;
  abandonedCalls: number;
  longestWaitSeconds: number;
  asaSeconds?: number;
  serviceLevelPercent?: number;
}

interface Queue {
  id: string;
  name: string;
  maxWaitSeconds: number;
  metrics: QueueMetrics;
}

// Colores según estado del agente
const STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  OFFLINE: { bg: '#6c757d', text: '#ffffff', border: '#5a6268' },
  DISPONIBLE: { bg: '#28a745', text: '#ffffff', border: '#218838' },
  TIMBRANDO: { bg: '#fd7e14', text: '#ffffff', border: '#e86a04' },
  EN_LLAMADA: { bg: '#007bff', text: '#ffffff', border: '#0069d9' },
  WRAP_UP: { bg: '#6f42c1', text: '#ffffff', border: '#5a32a3' },
  PAUSA: { bg: '#ffc107', text: '#212529', border: '#e0a800' },
};

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reloj en vivo que se actualiza cada segundo para los cronómetros
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cargar datos REST
  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, queuesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/agents`),
        fetch(`${API_BASE_URL}/queues`),
      ]);

      if (agentsRes.ok && queuesRes.ok) {
        const agentsData = await agentsRes.json();
        const queuesData = await queuesRes.json();
        setAgents(agentsData);
        setQueues(queuesData);
        setActionError(null);
      }
    } catch (error) {
      console.error('[FRONTEND] Error al obtener datos del servidor:', error);
    }
  }, []);

  // Conexión y reconexión automática de SSE
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${API_BASE_URL}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Conectado al servidor en tiempo real');
      setIsConnected(true);
      fetchData(); // Sincronizar datos al reconectar
    };

    // Al recibir notificaciones de actualización
    eventSource.addEventListener('update', () => {
      fetchData();
    });

    eventSource.onmessage = () => {
      fetchData();
    };

    eventSource.onerror = (err) => {
      console.warn('[SSE] Conexión perdida con el backend:', err);
      setIsConnected(false);
      eventSource.close();

      // Reconexión automática tras 3 segundos
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[SSE] Intentando reconectar...');
        connectSSE();
      }, 3000);
    };
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchData, connectSSE]);

  // Ejecutar acciones de agente (login, logout, pausar, despausar)
  const handleAgentAction = async (agentId: string, action: string, body?: { reason?: string }) => {
    try {
      setActionError(null);
      const res = await fetch(`${API_BASE_URL}/agents/${agentId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.message || `No se pudo realizar la acción ${action}`);
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de comunicación';
      setActionError(`Error al ejecutar ${action}: ${msg}`);
    }
  };

  const handlePause = (agentId: string) => {
    const reason = window.prompt('Motivo de la pausa (ej: Almuerzo, Capacitación):', 'Almuerzo');
    if (reason !== null) {
      handleAgentAction(agentId, 'pause', { reason: reason.trim() || 'Pausa operativa' });
    }
  };

  // Formateador de tiempo transcurrido
  const formatElapsedTime = (stateChangedAt: string) => {
    if (!stateChangedAt) return '00:00';
    const start = new Date(stateChangedAt).getTime();
    const diffSeconds = Math.max(0, Math.floor((now - start) / 1000));
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '24px', backgroundColor: '#f8f9fa', minHeight: '100vh', color: '#212529' }}>

      {/* Cabecera y Estado de Conexión en Tiempo Real */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #e9ecef' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', color: '#1a202c', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🎧</span> WeKall Contact Center
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6c757d', fontSize: '14px' }}>
            Panel de supervisión y gestión de agentes y colas en tiempo real
          </p>
        </div>

        {/* Indicador de Reconexión / Conexión (Requisito 3) */}
        <div>
          {isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', backgroundColor: '#d4edda', color: '#155724', fontWeight: 600, fontSize: '14px', border: '1px solid #c3e6cb' }}>
              <span style={{ height: '10px', width: '10px', borderRadius: '50%', backgroundColor: '#28a745', display: 'inline-block' }}></span>
              Conectado en tiempo real
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', backgroundColor: '#f8d7da', color: '#721c24', fontWeight: 600, fontSize: '14px', border: '1px solid #f5c6cb', animation: 'pulse 1.5s infinite' }}>
              <span style={{ height: '10px', width: '10px', borderRadius: '50%', backgroundColor: '#dc3545', display: 'inline-block' }}></span>
              Desconectado - Reconectando...
            </div>
          )}
        </div>
      </header>

      {/* Alerta de Error de Acción si ocurre */}
      {actionError && (
        <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #ffeeba', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* SECCIÓN 1: Métricas de Colas (Requisitos del punto 6) */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📊</span> Métricas por Cola en Tiempo Real
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {queues.map((queue) => (
            <div
              key={queue.id}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                transition: 'transform 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #edf2f7', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#2b6cb0' }}>{queue.name}</h3>
                <span style={{ fontSize: '12px', color: '#718096', backgroundColor: '#edf2f7', padding: '2px 8px', borderRadius: '12px' }}>
                  ID: {queue.id}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ backgroundColor: '#ebf8ff', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #3182ce' }}>
                  <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600 }}>En Cola</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2c5282' }}>
                    {queue.metrics?.waitingCalls ?? 0}
                  </div>
                </div>

                <div style={{ backgroundColor: '#f0fff4', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #38a169' }}>
                  <div style={{ fontSize: '12px', color: '#276749', fontWeight: 600 }}>Atendidas</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#22543d' }}>
                    {queue.metrics?.attendedCalls ?? 0}
                  </div>
                </div>

                <div style={{ backgroundColor: '#fff5f5', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #e53e3e' }}>
                  <div style={{ fontSize: '12px', color: '#9b2c2c', fontWeight: 600 }}>Abandonadas</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#742a2a' }}>
                    {queue.metrics?.abandonedCalls ?? 0}
                  </div>
                </div>

                <div style={{ backgroundColor: '#fffaf0', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #dd6b20' }}>
                  <div style={{ fontSize: '12px', color: '#9c4221', fontWeight: 600 }}>Espera Actual</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#7b341e' }}>
                    {(queue.metrics?.longestWaitSeconds ?? 0)}s
                  </div>
                </div>

                <div style={{ backgroundColor: '#faf5ff', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #805ad5' }}>
                  <div style={{ fontSize: '12px', color: '#553c9a', fontWeight: 600 }}>ASA (Vel. Respuesta)</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#44337a' }}>
                    {(queue.metrics?.asaSeconds ?? 0)}s
                  </div>
                </div>

                <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                  <div style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>Nivel Servicio (≤20s)</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#065f46' }}>
                    {queue.metrics?.serviceLevelPercent ?? 100}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECCIÓN 2: Tablero de Agentes (Requisitos del punto 1) */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', margin: 0, color: '#2d3748', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👤</span> Tablero de Agentes
          </h2>
          <span style={{ fontSize: '13px', color: '#718096' }}>
            Total Agentes: <strong>{agents.length}</strong>
          </span>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #edf2f7', color: '#4a5568' }}>
                <th style={{ padding: '14px 16px' }}>Agente</th>
                <th style={{ padding: '14px 16px' }}>Extensión</th>
                <th style={{ padding: '14px 16px' }}>Colas Asignadas</th>
                <th style={{ padding: '14px 16px' }}>Estado</th>
                <th style={{ padding: '14px 16px' }}>Tiempo en Estado (En vivo)</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const colors = STATE_COLORS[agent.state] || { bg: '#6c757d', text: '#ffffff', border: '#5a6268' };
                const isWrapUp = agent.state === 'WRAP_UP';
                const wrapRemaining = isWrapUp
                  ? Math.max(0, 15 - Math.floor((now - new Date(agent.stateChangedAt).getTime()) / 1000))
                  : null;

                return (
                  <tr key={agent.id} style={{ borderBottom: '1px solid #edf2f7', transition: 'background-color 0.2s' }}>
                    {/* Nombre y ID */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#2d3748' }}>{agent.name}</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0' }}>ID: {agent.id}</div>
                    </td>

                    {/* Extensión */}
                    <td style={{ padding: '14px 16px', color: '#4a5568', fontWeight: 500 }}>
                      📞 {agent.extension}
                    </td>

                    {/* Colas a las que pertenece */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {agent.queues.map((q) => (
                          <span
                            key={q}
                            style={{
                              backgroundColor: '#edf2f7',
                              color: '#4a5568',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontWeight: 500,
                            }}
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Estado con color distintivo (Requisito 1) */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.text,
                          padding: '5px 12px',
                          borderRadius: '14px',
                          fontWeight: 600,
                          fontSize: '12px',
                          display: 'inline-block',
                          border: `1px solid ${colors.border}`,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }}
                      >
                        {agent.state}
                        {agent.pauseReason ? ` (${agent.pauseReason})` : ''}
                      </span>
                    </td>

                    {/* Tiempo en el estado actual corriendo en vivo (Requisito 1) */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '14px', fontWeight: 600, color: '#2d3748' }}>
                        <span>⏱️</span>
                        <span>{formatElapsedTime(agent.stateChangedAt)}</span>
                        {isWrapUp && wrapRemaining !== null && (
                          <span style={{ fontSize: '11px', color: '#6f42c1', fontWeight: 'bold' }}>
                            (restan {wrapRemaining}s)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Botones de acción según la máquina de estados */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {agent.state === 'OFFLINE' && (
                          <button
                            onClick={() => handleAgentAction(agent.id, 'login')}
                            style={{
                              backgroundColor: '#28a745',
                              color: 'white',
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '12px',
                            }}
                          >
                            Login
                          </button>
                        )}

                        {agent.state === 'DISPONIBLE' && (
                          <>
                            <button
                              onClick={() => handlePause(agent.id)}
                              style={{
                                backgroundColor: '#ffc107',
                                color: '#212529',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '12px',
                              }}
                            >
                              Pausar
                            </button>
                            <button
                              onClick={() => handleAgentAction(agent.id, 'logout')}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '12px',
                              }}
                            >
                              Logout
                            </button>
                          </>
                        )}

                        {agent.state === 'PAUSA' && (
                          <>
                            <button
                              onClick={() => handleAgentAction(agent.id, 'unpause')}
                              style={{
                                backgroundColor: '#17a2b8',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '12px',
                              }}
                            >
                              Despausar
                            </button>
                            <button
                              onClick={() => handleAgentAction(agent.id, 'logout')}
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '12px',
                              }}
                            >
                              Logout
                            </button>
                          </>
                        )}

                        {(agent.state === 'TIMBRANDO' || agent.state === 'EN_LLAMADA' || agent.state === 'WRAP_UP') && (
                          <span style={{ fontSize: '12px', color: '#a0aec0', fontStyle: 'italic', padding: '6px 0' }}>
                            Ocupado en llamada
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
