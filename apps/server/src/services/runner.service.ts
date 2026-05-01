import { db, runs, runResults } from "@test-evals/db";
import { LLMService } from "@test-evals/llm";
import { EvaluationService } from "./evaluate.service";
import { ClinicalExtractionSchema, type RunStrategy } from "@test-evals/shared";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export class RunnerService {
  private llm: LLMService;
  private evaluator: EvaluationService;

  constructor(apiKey: string) {
    this.llm = new LLMService(apiKey);
    this.evaluator = new EvaluationService();
  }

  async createRun(strategy: RunStrategy, model: string) {
    const transcriptsDir = path.join(process.cwd(), "../../data/transcripts");
    const files = await fs.readdir(transcriptsDir);
    const transcriptIds = files.filter(f => f.endsWith(".txt")).map(f => f.replace(".txt", ""));

    const promptHash = this.calculatePromptHash(strategy);

    const [run] = await db.insert(runs).values({
      strategy,
      model,
      status: "pending",
      totalCases: transcriptIds.length,
      promptHash,
    }).returning();

    return run;
  }

  async startRun(runId: string, options: { resume?: boolean, force?: boolean } = {}) {
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, runId),
    });

    if (!run) throw new Error("Run not found");

    const transcriptsDir = path.join(process.cwd(), "../../data/transcripts");
    const goldDir = path.join(process.cwd(), "../../data/gold");
    const files = await fs.readdir(transcriptsDir);
    const transcriptIds = files.filter(f => f.endsWith(".txt")).map(f => f.replace(".txt", ""));

    await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));

    const semaphore = new Semaphore(5);
    const results: any[] = [];

    for (const id of transcriptIds) {
      // Check if already completed if resuming
      if (options.resume) {
        const existing = await db.query.runResults.findFirst({
          where: and(eq(runResults.runId, runId), eq(runResults.transcriptId, id)),
        });
        if (existing) continue;
      }

      // Check idempotency if not forced
      if (!options.force) {
          // Idempotency check across runs with same prompt hash and transcript
          const cached = await db.query.runResults.findFirst({
              where: eq(runResults.transcriptId, id),
              with: {
                  run: true
              }
          });
          // This is a bit simplified, ideally we check by promptHash too
      }

      await semaphore.acquire();
      
      this.processCase(run, id, transcriptsDir, goldDir).then(async (result) => {
        results.push(result);
        await this.updateRunProgress(runId);
        semaphore.release();
      }).catch(err => {
        console.error(`Error processing case ${id}:`, err);
        semaphore.release();
      });
    }
  }

  private async processCase(run: any, transcriptId: string, transcriptsDir: string, goldDir: string) {
    const transcript = await fs.readFile(path.join(transcriptsDir, `${transcriptId}.txt`), "utf-8");
    const goldJson = await fs.readFile(path.join(goldDir, `${transcriptId}.json`), "utf-8");
    const gold = JSON.parse(goldJson);

    const startTime = Date.now();
    const { prediction, attempts, schemaErrors, usage } = await this.llm.extract(transcript, run.strategy, run.model);
    const durationMs = Date.now() - startTime;

    const { scores, hallucinations } = this.evaluator.evaluate(transcript, prediction, gold);

    const costUsd = this.calculateCost(run.model, usage);

    const result = await db.insert(runResults).values({
      runId: run.id,
      transcriptId,
      prediction,
      gold,
      scores,
      hallucinations,
      schemaErrors,
      attempts,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      durationMs,
      costUsd: costUsd.toString(),
      status: prediction ? "completed" : "failed",
    }).returning();

    return result[0];
  }

  private async updateRunProgress(runId: string) {
    const results = await db.query.runResults.findMany({
      where: eq(runResults.runId, runId),
    });

    const completedCases = results.length;
    const totalCost = results.reduce((acc, r) => acc + parseFloat(r.costUsd), 0);
    const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);
    const totalInput = results.reduce((acc, r) => acc + r.inputTokens, 0);
    const totalOutput = results.reduce((acc, r) => acc + r.outputTokens, 0);
    const totalCacheRead = results.reduce((acc, r) => acc + r.cacheReadTokens, 0);
    const totalCacheWrite = results.reduce((acc, r) => acc + r.cacheWriteTokens, 0);
    const avgF1 = results.length > 0 ? results.reduce((acc, r) => acc + (r.scores as any).overall, 0) / results.length : 0;

    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) return;

    await db.update(runs).set({
      completedCases,
      progress: Math.round((completedCases / run.totalCases) * 100),
      totalCostUsd: totalCost.toString(),
      totalDurationMs: totalDuration,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheReadTokens: totalCacheRead,
      totalCacheWriteTokens: totalCacheWrite,
      aggregateF1: avgF1.toString(),
      status: completedCases === run.totalCases ? "completed" : "running",
      updatedAt: new Date(),
    }).where(eq(runs.id, runId));
  }

  private calculateCost(model: string, usage: any) {
    // Pricing for Claude 4.5 Haiku (estimated)
    const inputPrice = 0.80 / 1_000_000;
    const outputPrice = 4.00 / 1_000_000;
    const cacheReadPrice = 0.08 / 1_000_000;
    
    const inputCost = usage.input_tokens * inputPrice;
    const outputCost = usage.output_tokens * outputPrice;
    const cacheReadCost = (usage.cache_read_input_tokens || 0) * cacheReadPrice;
    
    return inputCost + outputCost + cacheReadCost;
  }

  private calculatePromptHash(strategy: RunStrategy): string {
    // In a real app, this would hash the actual prompt template
    return crypto.createHash("sha256").update(strategy).digest("hex");
  }
}

class Semaphore {
  private queue: ((value: boolean) => void)[] = [];
  constructor(private capacity: number) {}

  async acquire() {
    if (this.capacity > 0) {
      this.capacity--;
      return true;
    }
    return new Promise<boolean>(resolve => this.queue.push(resolve));
  }

  release() {
    this.capacity++;
    if (this.queue.length > 0) {
      this.capacity--;
      const resolve = this.queue.shift();
      resolve?.(true);
    }
  }
}
