import { Router } from 'express';
import { CenterController } from '../controllers/centerController';
import { EventController } from '../controllers/eventController';
import { sseService } from '../services/sseService';

const router = Router();

// Eventos de telefonía
router.post('/events', EventController.handleEvent);

// Gestión de agentes
router.get('/agents', CenterController.getAgents);
router.post('/agents/:id/login', CenterController.loginAgent);
router.post('/agents/:id/logout', CenterController.logoutAgent);
router.post('/agents/:id/pause', CenterController.pauseAgent);
router.post('/agents/:id/unpause', CenterController.unpauseAgent);

// Colas y métricas
router.get('/queues', CenterController.getQueues);

// Stream Server-Sent Events (SSE) en tiempo real
router.get('/stream', (req, res) => {
  sseService.addClient(req, res);
});

export default router;
