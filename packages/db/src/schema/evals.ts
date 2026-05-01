import { pgTable, text, timestamp, integer, jsonb, uuid, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  strategy: text("strategy", { enum: ["zero_shot", "few_shot", "cot"] }).notNull(),
  model: text("model").notNull(),
  status: text("status", { enum: ["pending", "running", "completed", "failed"] }).notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  totalCases: integer("total_cases").notNull(),
  completedCases: integer("completed_cases").notNull().default(0),
  totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  totalDurationMs: integer("total_duration_ms").notNull().default(0),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  totalCacheReadTokens: integer("total_cache_read_tokens").notNull().default(0),
  totalCacheWriteTokens: integer("total_cache_write_tokens").notNull().default(0),
  aggregateF1: numeric("aggregate_f1", { precision: 5, scale: 4 }).notNull().default("0"),
  promptHash: text("prompt_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const runResults = pgTable("run_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }).notNull(),
  transcriptId: text("transcript_id").notNull(),
  prediction: jsonb("prediction"),
  gold: jsonb("gold").notNull(),
  scores: jsonb("scores").notNull(),
  hallucinations: jsonb("hallucinations").notNull(),
  schemaErrors: jsonb("schema_errors").notNull(),
  attempts: jsonb("attempts").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  durationMs: integer("duration_ms").notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
  status: text("status", { enum: ["completed", "failed"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const runsRelations = relations(runs, ({ many }) => ({
  results: many(runResults),
}));

export const runResultsRelations = relations(runResults, ({ one }) => ({
  run: one(runs, {
    fields: [runResults.runId],
    references: [runs.id],
  }),
}));
