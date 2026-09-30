import { Router } from "express";
import {
  getStudentByIdHandler,
  getStudentsHandler,
  getStudentTierHandler,
  getStudentTrainingHandler,
  updateStudentTierHandler,
} from "../controllers/student.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getStudentsHandler);
router.get("/:id", getStudentByIdHandler);
router.get("/:id/tier", getStudentTierHandler);
router.get("/:id/training", getStudentTrainingHandler);

// Admin-only Tier update endpoint
router.patch("/:id/tier", authenticate, requireRole("ADMINISTRATOR"), updateStudentTierHandler);

export default router;
