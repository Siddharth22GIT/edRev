import { Router } from "express";
import {
  changePasswordHandler,
  getMeHandler,
  loginHandler,
  signupConfigHandler,
  signupHandler,
  updatePreferencesHandler,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", loginHandler);
// Public student self sign-up (accounts start PENDING_APPROVAL)
router.get("/signup-config", signupConfigHandler);
router.post("/signup", signupHandler);
router.get("/me", authenticate, getMeHandler);
// Account settings: always act on the signed-in user, never on an id from the request
router.post("/password", authenticate, changePasswordHandler);
router.patch("/me/preferences", authenticate, updatePreferencesHandler);

export default router;
