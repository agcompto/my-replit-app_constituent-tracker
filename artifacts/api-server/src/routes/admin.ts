import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

const ResetPasswordBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /admin/reset-password
 *
 * Proxies a password-reset request to the internal reset-password function
 * running at reset-password.railway.internal. This endpoint exists because
 * the reset-password service is only reachable over Railway's private network
 * and cannot be called directly from outside the deployment environment.
 *
 * Body: { email: string, password: string }
 */
router.post("/admin/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  let upstream: Response;
  try {
    upstream = await fetch("http://reset-password.railway.internal/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to reach reset-password internal service");
    res.status(502).json({ error: "Could not reach the reset-password service" });
    return;
  }

  let body: unknown;
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await upstream.json();
  } else {
    body = await upstream.text();
  }

  res.status(upstream.status).json(body);
});

export default router;
