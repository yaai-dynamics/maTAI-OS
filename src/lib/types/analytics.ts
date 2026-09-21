import { z } from 'zod';
import { provenanceSchema } from '@/lib/types/core';

/**
 * Derived metrics, alerts and the government answer contract.
 * Reference: docs/04-data-model.md, docs/05-ai-spec.md.
 */

export const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const tourismMetricSchema = z.object({
  id: z.string(),
  metric: z.string(),
  label: z.string(),
  entityType: z.enum(['STATE', 'DISTRICT', 'DESTINATION', 'CAMPAIGN', 'BUSINESS']),
  entityId: z.string(),
  value: z.number(),
  unit: z.enum(['COUNT', 'INDEX', 'PERCENT', 'RATING', 'RATIO', 'CURRENCY_INR']),
  periodStart: z.string(),
  periodEnd: z.string(),
  provenance: provenanceSchema,
  confidence: confidenceSchema,
  sourceCount: z.number().int().nonnegative(),
  /** Plain-language description of how the number was produced. */
  calculationMethod: z.string(),
  sourceIds: z.array(z.string()).default([]),
});
export type TourismMetric = z.infer<typeof tourismMetricSchema>;

export const alertSeveritySchema = z.enum(['INFO', 'WATCH', 'ACTION']);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const alertSchema = z.object({
  id: z.string(),
  entityType: z.enum(['DESTINATION', 'DISTRICT', 'CAMPAIGN', 'STATE']),
  entityId: z.string(),
  entityName: z.string(),
  severity: alertSeveritySchema,
  title: z.string(),
  description: z.string(),
  detectedAt: z.string(),
  /** Deterministic rule that produced the alert, shown in the UI. */
  rule: z.string(),
  provenance: provenanceSchema,
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).default('OPEN'),
});
export type Alert = z.infer<typeof alertSchema>;

/** One evidence row behind a government answer. */
export const evidenceItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  source: z.string(),
  provenance: provenanceSchema,
  /** Optional period so a figure is never quoted without its coverage. */
  period: z.string().optional(),
  method: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const chartPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  secondaryValue: z.number().optional(),
  highlight: z.boolean().optional(),
});
export type ChartPoint = z.infer<typeof chartPointSchema>;

export const answerChartSchema = z.object({
  kind: z.enum(['BAR', 'LINE', 'FUNNEL', 'RANKED_BAR']),
  title: z.string(),
  unit: z.string(),
  points: z.array(chartPointSchema),
  provenance: provenanceSchema,
});
export type AnswerChart = z.infer<typeof answerChartSchema>;

/**
 * Record of which deterministic tool produced which evidence, so an important
 * government answer can be audited later (master document section 8).
 */
export const toolTraceSchema = z.object({
  tool: z.string(),
  input: z.string(),
  summary: z.string(),
  rowsConsidered: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
});
export type ToolTrace = z.infer<typeof toolTraceSchema>;

/** The answer contract every Decision Room response must satisfy. */
export const governmentAnswerSchema = z.object({
  question: z.string(),
  intent: z.string(),
  answer: z.string(),
  evidence: z.array(evidenceItemSchema),
  recommendation: z.string().optional(),
  confidence: confidenceSchema,
  confidenceReason: z.string(),
  caveats: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  charts: z.array(answerChartSchema).default([]),
  toolTrace: z.array(toolTraceSchema).default([]),
  /** True when any input was synthetic, forcing a visible demo-data notice. */
  usesSyntheticData: z.boolean().default(true),
  generatedBy: z.string(),
  generatedAt: z.string(),
});
export type GovernmentAnswer = z.infer<typeof governmentAnswerSchema>;
