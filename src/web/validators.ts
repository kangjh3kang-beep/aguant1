/**
 * API 입력 검증 스키마 (Zod)
 *
 * 오케스트레이터 인사이트: "API 프로젝트에 입력 검증 계층이 없음"
 * → 모든 API 엔드포인트에 타입-안전한 런타임 검증 추가
 */

import { z } from 'zod';

const VALID_STAGES = ['compile', 'lint', 'test'] as const;
const VALID_PHASES = ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy'] as const;

// ─── 공통 ───

export const projectPathSchema = z.string()
  .min(1, '경로가 비어있습니다')
  .refine((p) => !p.includes('..'), '상대경로 구성요소(..)는 허용되지 않습니다')
  .optional();

// ─── POST /api/review ───

export const reviewBodySchema = z.object({
  path: projectPathSchema,
  stages: z.array(z.enum(VALID_STAGES)).min(1).default(['compile', 'lint', 'test']),
  autoFix: z.boolean().default(false),
}).strict();

export type ReviewBody = z.infer<typeof reviewBodySchema>;

// ─── POST /api/orchestrate ───

export const orchestrateBodySchema = z.object({
  path: projectPathSchema,
  phases: z.array(z.enum(VALID_PHASES)).min(1).default(['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy']),
  failFast: z.boolean().default(false),
}).strict();

export type OrchestrateBody = z.infer<typeof orchestrateBodySchema>;

// ─── GET /api/history ───

export const historyQuerySchema = z.object({
  path: projectPathSchema,
  count: z.coerce.number().int().min(1).max(100).default(20),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// ─── GET /api/project, /api/trend, /api/quality-score ───

export const pathQuerySchema = z.object({
  path: projectPathSchema,
});

export type PathQuery = z.infer<typeof pathQuerySchema>;

// ─── 검증 헬퍼 ───

export function validateBody<T>(schema: z.ZodType<T>, body: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { data: result.data };
  }
  const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { error: `Validation failed: ${messages}` };
}
