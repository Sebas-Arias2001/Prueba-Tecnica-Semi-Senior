import type { Request, Response } from 'express';

class SSEService {
  private clients: Response[] = [];

  // Método para agregar un nuevo cliente a la lista de clientes conectados en tiempo real
  addClient(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    this.clients.push(res);
    console.log(`[SSE] Nuevo cliente conectado. Clientes activos: ${this.clients.length}`);

    // Enviar confirmación inicial al cliente
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado al stream SSE' })}\n\n`);

    req.on('close', () => {
      this.clients = this.clients.filter((client) => client !== res);
      console.log(`[SSE] Cliente desconectado. Clientes activos: ${this.clients.length}`);
    });
  }

  // Notificar a todos los clientes conectados sobre un evento específico
  notifyClients(eventType: string, data: unknown) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.write(payload);
      } catch (err) {
        console.error('[SSE] Error enviando mensaje a cliente:', err);
      }
    });
  }

  // Enviar snapshot general del estado (agentes y colas con métricas)
  broadcastUpdate(payload: { type: string; data?: unknown }) {
    this.notifyClients('update', payload);
  }
}

export const sseService = new SSEService();
