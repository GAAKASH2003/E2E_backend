import { Router } from "express";
import {
  criticalAlerts,
  suspiciousAlerts,
} from "../controllers/alertsController";
const router = Router();
router.get("/critical", criticalAlerts);
router.get("/suspicious", suspiciousAlerts);
export default router;
