import { Router } from "express";
import { getMeHandler, loginHandler } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", loginHandler);
router.get("/me", authenticate, getMeHandler);

export default router;
