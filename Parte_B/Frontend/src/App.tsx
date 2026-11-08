import React, { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3000/api';

export default function App() {
  const [agents, setAgents] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const agentsRes = await fetch(`${API_URL}/agents`);
      const agentsData = await agentsRes.json();
      setAgents(agentsData);

      const queuesRes = await fetch(`${API_URL}/queues`);
      const queuesData = await queuesRes.json();
      setQueues(queuesData);
    } catch (error) {
      console.error('Error al obtener datos:', error);
    }
  };

  useEffect(() => {
    // Carga inicial
    fetchData();

    // Conexión Server-Sent Events (SSE) para tiempo real
    const eventSource = new EventSource(`${API_URL}/stream`);

    eventSource.onmessage = () => {
      // Cada vez que el backend notifique un cambio, refrescamos los datos
      fetchData();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleAgentAction = async (agentId: string, action: string, body?: any) => {
    try {
      await fetch(`${API_URL}/agents/${agentId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      fetchData();
    } catch (error) {
      console.error(`Error en acción ${action}:`, error);
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>WeKall Contact Center - Panel de Control</h1>

      {/* Sección de Colas y Métricas */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Colas de Llamadas</h2>
        <div style={{ display: 'flex', gap: '20px' }}>
          {queues.map(queue => (
            <div key={queue.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', flex: 1 }}>
              <h3>{queue.name}</h3>
              <p><strong>En Cola:</strong> {queue.metrics?.waitingCalls ?? 0}</p>
              <p><strong>Atendidas:</strong> {queue.metrics?.attendedCalls ?? 0}</p>
              <p><strong>Abandonadas:</strong> {queue.metrics?.abandonedCalls ?? 0}</p>
              <p><strong>Espera Máxima:</strong> {queue.metrics?.longestWaitSeconds ?? 0}s</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sección de Agentes */}
      <section>
        <h2>Agentes</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f4f4f4', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '10px' }}>Nombre</th>
              <th style={{ padding: '10px' }}>Extensión</th>
              <th style={{ padding: '10px' }}>Estado</th>
              <th style={{ padding: '10px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>{agent.name}</td>
                <td style={{ padding: '10px' }}>{agent.extension}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    color: '#fff',
                    background: agent.state === 'DISPONIBLE' ? 'green' : agent.state === 'EN_LLAMADA' ? 'blue' : agent.state === 'TIMBRANDO' ? 'orange' : agent.state === 'WRAP_UP' ? 'purple' : 'gray'
                  }}>
                    {agent.state}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>
                  {agent.state === 'OFFLINE' && (
                    <button onClick={() => handleAgentAction(agent.id, 'login')}>Login</button>
                  )}
                  {agent.state === 'DISPONIBLE' && (
                    <>
                      <button onClick={() => handleAgentAction(agent.id, 'pause', { reason: 'Almuerzo' })} style={{ marginRight: '5px' }}>Pausar</button>
                      <button onClick={() => handleAgentAction(agent.id, 'logout')}>Logout</button>
                    </>
                  )}
                  {agent.state === 'PAUSA' && (
                    <button onClick={() => handleAgentAction(agent.id, 'unpause')}>Despausar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}