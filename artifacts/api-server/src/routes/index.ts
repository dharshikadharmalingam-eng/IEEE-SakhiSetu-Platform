import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import learningRouter from "./learning";
import womanRouter from "./woman";
import opportunitiesRouter from "./opportunities";
import employerRouter from "./employer";
import engagementRouter from "./engagement";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// learning is mounted before woman so the shared /skills/catalog is reachable by every signed-in role.
router.use(learningRouter);
router.use(womanRouter);
router.use(opportunitiesRouter);
router.use(employerRouter);
router.use(engagementRouter);
router.use(adminRouter);

export default router;
