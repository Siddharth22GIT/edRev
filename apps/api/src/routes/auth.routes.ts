import { Router } from "express";
import { changePasswordHandler, getMeHandler, loginHandler, updatePreferencesHandler } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", loginHandler);
router.get("/me", authenticate, getMeHandler);
// Account settings: always act on the signed-in user, never on an id from the request
router.post("/password", authenticate, changePasswordHandler);
router.patch("/me/preferences", authenticate, updatePreferencesHandler);

export default router;
