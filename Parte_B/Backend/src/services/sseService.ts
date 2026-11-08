import type { Response } from "express";

class SSEService {
  private clients: Response[] = [];

  // Método para agregar un nuevo cliente a la lista de clientes conectados en tiempo real
  addClient(req: Response, res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    this.clients.push(res);

    req.on("close", () => {
      this.clients = this.clients.filter((client) => client !== res);
    });
  }

  // Método para notificar a todos los clientes conectados sobre un evento
  notifyClients(eventType: string, data: any) {
    this.clients.forEach((client) => {
      client.write(`event: ${eventType}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

export const sseService = new SSEService();
