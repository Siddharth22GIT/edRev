import { Router } from "express";
import {
  getStudentByIdHandler,
  getStudentReadinessHandler,
  getStudentsHandler,
  getStudentTierHandler,
  getStudentTrainingHandler,
  updateStudentTierHandler,
  updateTrainingModuleStatusHandler,
} from "../controllers/student.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getStudentsHandler);
router.get("/:id", getStudentByIdHandler);
router.get("/:id/readiness", getStudentReadinessHandler);
router.get("/:id/tier", getStudentTierHandler);
router.get("/:id/training", getStudentTrainingHandler);

// Interactive training update (authenticated student/mentor/admin)
router.patch("/:id/training/:moduleId", authenticate, updateTrainingModuleStatusHandler);

// Admin-only Tier update endpoint
router.patch("/:id/tier", authenticate, requireRole("ADMINISTRATOR"), updateStudentTierHandler);

export default router;
