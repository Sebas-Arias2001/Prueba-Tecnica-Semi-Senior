import { Router } from "express";
import { CenterController } from "../controllers/centerController";
import { EventController } from "../controllers/eventController";
import { sseService } from "../services/sseService";

const router = Router();

router.post("/events", EventController.handleEvent);
router.get("/agents", CenterController.getAgents);
router.post("/agents/:id/login", CenterController.LoginAgent);
router.post("/agents/:id/logout", CenterController.logoutAgent);
router.post("/agents/:id/pause", CenterController.pauseAgent);
router.post("/agents/:id/unpause", CenterController.unpauseAgent);
router.get("/queues", CenterController.getQueues);

router.get("/stream", (req, res) => {
  sseService.addClient(req, res);
});

export default router;
