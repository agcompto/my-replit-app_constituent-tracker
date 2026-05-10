import { Router, type IRouter } from "express";
import { GetCampaignHealthCheckParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { computeHealthCheck } from "../lib/healthCheck";

const router: IRouter = Router();

router.get(
  "/campaigns/:id/health-check",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetCampaignHealthCheckParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await computeHealthCheck(params.data.id);
    res.json(result);
  },
);

export default router;
