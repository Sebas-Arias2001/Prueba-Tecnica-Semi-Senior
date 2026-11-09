import type { Request, Response } from 'express';
import type { EventPayload } from '../models/types';
import { CallQueueService } from '../services/callQueueService';

// Set en memoria para registrar eventIds procesados (Control de idempotencia)
export const processedEvents = new Set<string>();

export class EventController {
  static handleEvent(req: Request, res: Response) {
    const body = req.body;

    if (!body) {
      return res.status(400).json({
        success: false,
        message: 'Cuerpo de petición requerido',
      });
    }

    // Soporta tanto un evento único como un lote de eventos (array)
    const events: EventPayload[] = Array.isArray(body) ? body : [body];
    const results = [];

    for (const event of events) {
      const { eventId, ts, type, callId, queue, callerId, agentId } = event;

      if (!eventId || !type) {
        results.push({
          eventId: eventId || 'desconocido',
          status: 'error',
          message: 'eventId y type son campos obligatorios',
        });
        continue;
      }

      // Requisito 3: Si el eventId ya fue procesado, no cambia nada
      if (processedEvents.has(eventId)) {
        console.log(`[LOG RECHAZADO] Evento duplicado recibido: ${eventId}`);
        results.push({
          eventId,
          status: 'ignored_duplicate',
          message: 'Evento duplicado ya procesado con anterioridad',
        });
        continue;
      }

      try {
        let actionResult = { success: true, message: 'Evento procesado' };

        switch (type) {
          case 'call.incoming':
            if (callId && queue && callerId) {
              actionResult = CallQueueService.handleIncomingCall(
                callId,
                queue,
                callerId,
                ts
              );
            } else {
              actionResult = {
                success: false,
                message:
                  'call.incoming requiere los campos callId, queue y callerId',
              };
            }
            break;

          case 'call.answered':
            if (callId && agentId) {
              actionResult = CallQueueService.handleCallAnswered(
                callId,
                agentId,
                ts
              );
            } else {
              actionResult = {
                success: false,
                message: 'call.answered requiere los campos callId y agentId',
              };
            }
            break;

          case 'call.hangup':
            if (callId) {
              actionResult = CallQueueService.handleCallHangup(callId, ts);
            } else {
              actionResult = {
                success: false,
                message: 'call.hangup requiere el campo callId',
              };
            }
            break;

          case 'call.noanswer':
            if (callId) {
              actionResult = CallQueueService.handleNoAnswer(callId);
            } else {
              actionResult = {
                success: false,
                message: 'call.noanswer requiere el campo callId',
              };
            }
            break;

          default:
            console.warn(`[LOG RECHAZADO] Tipo de evento desconocido: ${type}`);
            actionResult = {
              success: false,
              message: `Tipo de evento no soportado: ${type}`,
            };
        }

        // Registrar el eventId como procesado para garantizar idempotencia
        processedEvents.add(eventId);

        results.push({
          eventId,
          status: actionResult.success ? 'processed' : 'ignored',
          message: actionResult.message,
        });
      } catch (error: any) {
        console.error(
          `[LOG ERROR] Error al procesar evento ${eventId}:`,
          error.message
        );
        results.push({
          eventId,
          status: 'error',
          message: error.message || 'Error interno al procesar el evento',
        });
      }
    }

    const isSingle = !Array.isArray(body);
    return res.status(200).json({
      success: true,
      result: isSingle ? results[0] : undefined,
      results: isSingle ? undefined : results,
    });
  }

  static _resetForTesting() {
    processedEvents.clear();
  }
}
