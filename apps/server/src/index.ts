import { auth } from "@test-evals/auth";
import { env } from "@test-evals/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { RunnerService } from "./services/runner.service";
import { db, runs, runResults } from "@test-evals/db";
import { eq, desc } from "drizzle-orm";
import { streamSSE } from "hono/streaming";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const runner = new RunnerService(env.ANTHROPIC_API_KEY || "");

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => {
  return c.text("OK");
});

// Create and start a run
app.post("/api/v1/runs", async (c) => {
  const { strategy, model } = await c.req.json();
  const run = await runner.createRun(strategy, model);
  
  // Start the run in the background
  runner.startRun(run.id).catch(console.error);
  
  return c.json(run);
});

// List runs
app.get("/api/v1/runs", async (c) => {
  const allRuns = await db.query.runs.findMany({
    orderBy: [desc(runs.createdAt)],
  });
  return c.json(allRuns);
});

// Get run detail
app.get("/api/v1/runs/:id", async (c) => {
  const id = c.req.param("id");
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, id),
    with: {
      results: true,
    },
  });
  if (!run) return c.notFound();
  return c.json(run);
});

// Resume a run
app.post("/api/v1/runs/:id/resume", async (c) => {
  const id = c.req.param("id");
  runner.startRun(id, { resume: true }).catch(console.error);
  return c.json({ status: "resuming" });
});

// SSE progress stream
app.get("/api/v1/runs/:id/stream", async (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    while (true) {
      const run = await db.query.runs.findFirst({
        where: eq(runs.id, id),
      });
      if (!run) break;
      
      await stream.writeSSE({
        data: JSON.stringify(run),
        event: "progress",
      });
      
      if (run.status === "completed" || run.status === "failed") break;
      await new Promise(r => setTimeout(r, 1000));
    }
  });
});

export default app;
