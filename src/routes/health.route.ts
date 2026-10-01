import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config/env";
import redis from "../services/redis.service";

const router = Router();

/*
Liveness — "the process is up". Cheap, no dependencies touched, safe for
a container orchestrator to poll every few seconds.
*/
router.get("/", (req, res) => {
  return res.json({
    message: "Server is healthy",
    action: "success",
  });
});

/*
Readiness — "the process can actually serve traffic". Checks each
dependency separately so an outage names itself.

The model check is deliberate: the review model was retired upstream and
the only way we found out was a user hitting the error. ?deep=true also
pings the provider, which is slower and costs a request, so leave it off
for routine polling and use it for alerting.
*/
router.get("/health", async (req, res) => {
  const deep = req.query.deep === "true";

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1 === connected
  checks.mongo = {
    ok: mongoose.connection.readyState === 1,
    detail: `readyState=${mongoose.connection.readyState}`,
  };

  try {
    const pong = await redis.ping();
    checks.redis = { ok: pong === "PONG" };
  } catch (error) {
    checks.redis = {
      ok: false,
      detail: error instanceof Error ? error.message : "ping failed",
    };
  }

  if (deep) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        checks.model = { ok: false, detail: `provider returned ${response.status}` };
      } else {
        const body = (await response.json()) as { data?: { id: string }[] };
        const available = (body.data || []).some(
          (model) => model.id === env.GROQ_MODEL,
        );

        checks.model = {
          ok: available,
          detail: available
            ? env.GROQ_MODEL
            : `configured model "${env.GROQ_MODEL}" is not available to this key`,
        };
      }
    } catch (error) {
      checks.model = {
        ok: false,
        detail: error instanceof Error ? error.message : "unreachable",
      };
    }
  }

  const healthy = Object.values(checks).every((check) => check.ok);

  // 503 so a load balancer takes the instance out of rotation
  return res.status(healthy ? 200 : 503).json({
    message: healthy ? "All systems operational" : "Degraded",
    action: healthy ? "success" : "degraded",
    checks,
  });
});

export default router;
