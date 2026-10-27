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
import { authenticate, requirePermission, requireSelfOrPermission } from "../middleware/auth.middleware.js";

const router = Router();

// Students see only their own record (scoped in the handler); staff see the whole cohort
router.get("/", authenticate, getStudentsHandler);
router.get("/:id", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW"), getStudentByIdHandler);
router.get("/:id/readiness", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW"), getStudentReadinessHandler);
router.get("/:id/tier", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW"), getStudentTierHandler);
router.get("/:id/training", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW"), getStudentTrainingHandler);

// Interactive training update (the student themself, or a mentor/coordinator/faculty/admin)
router.patch("/:id/training/:moduleId", authenticate, requireSelfOrPermission("STUDENT_SUPERVISE"), updateTrainingModuleStatusHandler);

// Admin-only Tier update endpoint
router.patch("/:id/tier", authenticate, requirePermission("TIER_UPDATE"), updateStudentTierHandler);

export default router;
