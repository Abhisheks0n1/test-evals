import { z } from "zod";

export const VitalsSchema = z.object({
  bp: z.string().regex(/^[0-9]{2,3}\/[0-9]{2,3}$/).nullable(),
  hr: z.number().int().min(20).max(250).nullable(),
  temp_f: z.number().min(90).max(110).nullable(),
  spo2: z.number().int().min(50).max(100).nullable(),
});

export const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  route: z.string().nullable(),
});

export const DiagnosisSchema = z.object({
  description: z.string().min(1),
  icd10: z.string().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/).optional(),
});

export const FollowUpSchema = z.object({
  interval_days: z.number().int().min(0).max(730).nullable(),
  reason: z.string().nullable(),
});

export const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string().min(1),
  vitals: VitalsSchema,
  medications: z.array(MedicationSchema),
  diagnoses: z.array(DiagnosisSchema),
  plan: z.array(z.string().min(1)),
  follow_up: FollowUpSchema,
});

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;
export type Vitals = z.infer<typeof VitalsSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;

export const RunStrategySchema = z.enum(["zero_shot", "few_shot", "cot"]);
export type RunStrategy = z.infer<typeof RunStrategySchema>;

export const RunStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  transcriptId: z.string(),
  prediction: ClinicalExtractionSchema.nullable(),
  gold: ClinicalExtractionSchema,
  scores: z.record(z.string(), z.number()),
  hallucinations: z.array(z.string()),
  schemaErrors: z.array(z.string()),
  attempts: z.array(z.any()),
  metrics: z.object({
    tokens: z.object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
    }),
    durationMs: z.number(),
    costUsd: z.coerce.number(),
  }),
  status: RunStatusSchema,
});

export type RunResult = z.infer<typeof RunResultSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  strategy: RunStrategySchema,
  model: z.string(),
  status: RunStatusSchema,
  progress: z.number(),
  totalCases: z.number(),
  completedCases: z.number(),
  aggregateF1: z.coerce.number(),
  totalCostUsd: z.coerce.number(),
  totalDurationMs: z.number(),
  totalTokens: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;
