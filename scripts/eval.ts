import { RunnerService } from "../apps/server/src/services/runner.service";
import { db } from "@test-evals/db";
import { env } from "@test-evals/env/server";
import { parseArgs } from "util";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      strategy: { type: "string", default: "zero_shot" },
      model: { type: "string", default: "claude-haiku-4-5-20251001" },
    },
    strict: false,
  });

  const strategy = values.strategy as any;
  const model = values.model as string;

  console.log(`🚀 Starting CLI Eval: strategy=${strategy}, model=${model}`);

  const runner = new RunnerService(env.ANTHROPIC_API_KEY || "");
  const run = await runner.createRun(strategy, model);

  console.log(`Run created with ID: ${run.id}`);

  await runner.startRun(run.id);

  const results = await db.query.runResults.findMany({
    where: (r, { eq }) => eq(r.runId, run.id),
  });

  const finalRun = await db.query.runs.findFirst({
    where: (r, { eq }) => eq(r.id, run.id),
  });

  console.log("\n📊 Eval Summary:");
  console.table({
    "Strategy": finalRun?.strategy,
    "Model": finalRun?.model,
    "Status": finalRun?.status,
    "Completed": `${finalRun?.completedCases}/${finalRun?.totalCases}`,
    "Cost (USD)": `$${finalRun?.totalCostUsd}`,
    "Duration (s)": (finalRun?.totalDurationMs || 0) / 1000,
  });

  const aggregateScores = results.reduce((acc, r) => {
    const scores = r.scores as any;
    Object.keys(scores).forEach(k => {
      acc[k] = (acc[k] || 0) + scores[k];
    });
    return acc;
  }, {} as any);

  console.log("\n📈 Field-level Scores:");
  Object.keys(aggregateScores).forEach(k => {
    console.log(`${k.padEnd(20)}: ${(aggregateScores[k] / results.length).toFixed(4)}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
