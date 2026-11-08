import { Request, Response } from "express";
import { EventPayload } from "../models/types";
import { CallQueueService } from "../services/callQueueService";

// Set en memoria para registrar eventIds procesados (Control de idempotencia)
const processedEvents = new Set<string>();

export class EventController {
  static handleEvent(req: Request, res: Response) {
    const body = req.body;

    // Soporta tanto un evento único como un lote de eventos (array)
    const events: EventPayload[] = Array.isArray(body) ? body : [body];
    const results = [];

    for (const event of events) {
      const { eventId, type, callId, queue, callerId, agentId } = event;

      //Si el eventId ya fue procesado, se ignora sin alterar el estado
      if (processedEvents.has(eventId)) {
        console.log(`[LOG RECHAZADO] Evento duplicado recibido: ${eventId}`);
        results.push({ eventId, status: "ignored_duplicate" });
        continue;
      }
    }

    try {
      switch (type) {
        case "call.incoming":
          if (callId && queue && callerId) {
            CallQueueService.handleIncomingCall(callId, queue, callerId);
          }
          break;

        case "call.answered":
          if (callId && agentId) {
            CallQueueService.handleCallAnswered(callId, agentId);
          }
          break;

        case "call.hangup":
          if (callId) {
            CallQueueService.handleCallHangup(callId);
          }
          break;

        default:
          console.warn(`[LOG RECHAZADO] Tipo de evento desconocido: ${type}`);
      }

      // Registrar el eventId como procesado para evitar duplicados futuros
      processedEvents.add(eventId);
      results.push({ eventId, status: "processed" });
    } catch (error: any) {
      console.error(
        `[LOG ERROR] Error al procesar evento ${eventId}:`,
        error.message,
      );
      results.push({ eventId, status: "error", message: error.message });
    }

    res.status(200).json({ success: true, results });
  }
}
