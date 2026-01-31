/**
 * Reviewer Agent — 시니어 코드 리뷰 전문가
 *
 * ━━━ 전문 분야 ━━━
 *  · 컴파일·린트·테스트 자동 실행 + 코드 품질 심층 분석
 *  · 코드 스멜(Code Smell) 25종 자동 탐지
 *  · 복잡도 분석 (대형 함수, 깊은 중첩, 긴 파라미터 리스트)
 *  · SOLID 원칙 위반 패턴 식별
 *  · 자동 수정(Auto-Fix) + 학습 루프(Learning Loop) + 트렌드 분석
 *
 * ━━━ Phase 8 강화 ━━━
 *  · 감지 → 수정 직접 연결 (CodeTransformer 통합)
 *  · autoFixable 정확한 분류 (CodeTransformer 처리 가능 여부 기반)
 *  · 수정 결과 리포트 포함
 */

import fs from 'fs';
import path from 'path';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
import { CodeReviewAgent } from '../../agent';
import { formatReportAsText } from '../../report-generator';
import type { TransformType } from '../code-transformer';

/* ═════════════════════════════════════════════════
   코드 스멜 탐지 패턴 — Expert Code Smell DB
   ═══════════════════════════════════════════════ */

/** CodeTransformer가 자동 수정 가능한 스멜 → 변환 타입 매핑 */
const FIXABLE_SMELL_MAP: Record<string, TransformType> = {
  'Console Statement in Production': 'remove-console',
  'TypeScript `any` Usage': 'replace-any-type',
  'Empty Catch Block': 'fix-empty-catch',
  'Non-null Assertion (!.)': 'remove-non-null-assertion',
};

const CODE_SMELL_PATTERNS: { pattern: RegExp; name: string; advice: string; severity: 'warning' | 'info' }[] = [
  { pattern: /function\s+\w+\s*\([^)]{120,}\)/g, name: 'Long Parameter List (5+ params)', advice: '파라미터 객체(Options Object)로 묶으세요', severity: 'warning' },
  { pattern: /if\s*\([^)]+\)\s*\{[^}]*if\s*\([^)]+\)\s*\{[^}]*if\s*\([^)]+\)/g, name: 'Deep Nesting (3+ levels)', advice: 'Early Return/Guard Clause 패턴으로 중첩을 줄이세요', severity: 'warning' },
  { pattern: /console\.(log|warn|error|debug|info)\s*\(/g, name: 'Console Statement in Production', advice: '구조화된 로거(winston/pino)를 사용하세요', severity: 'info' },
  { pattern: /\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*HACK|\/\/\s*XXX/gi, name: 'TODO/FIXME Comment', advice: '기술 부채 — 이슈 트래커에 등록하고 해결하세요', severity: 'info' },
  { pattern: /any(?:\s|;|,|\)|\]|>)/g, name: 'TypeScript `any` Usage', advice: 'unknown + 타입 가드, 또는 구체적 타입을 사용하세요', severity: 'warning' },
  { pattern: /as\s+\w+(?:<[^>]+>)?(?:\s*;|\s*$)/gm, name: 'Type Assertion (as)', advice: '타입 단언 대신 타입 가드(is), Discriminated Union을 사용하세요', severity: 'info' },
  { pattern: /!\./g, name: 'Non-null Assertion (!.)', advice: 'Optional chaining(?.)이나 null 체크로 대체하세요', severity: 'info' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, name: 'Empty Catch Block', advice: '에러를 삼키지 마세요 — 로깅하거나 재throw 하세요', severity: 'warning' },
  { pattern: /new\s+Promise\s*\(\s*\(resolve,\s*reject\)\s*=>/g, name: 'Promise Constructor Anti-pattern', advice: '가능하면 async/await를 직접 사용하세요', severity: 'info' },
  { pattern: /\.then\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then/g, name: 'Promise Chain (3+ .then)', advice: 'async/await로 리팩토링하세요', severity: 'info' },
];

export class ReviewerAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Reviewer Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'compile-check',
      'lint-analysis',
      'test-execution',
      'auto-fix',
      'diff-review',
      'learning-loop',
      'trend-analysis',
      'code-smell-detection',
      'complexity-analysis',
      'solid-violation-check',
      'dead-code-detection',
      'direct-code-fix',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];

    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    const enhancedOutputs: string[] = [];
    enhancedOutputs.push('[REVIEWER] ── Prompt Enhancement Applied ──');
    enhancedOutputs.push(`[REVIEWER] 강화된 지시: ${enhanced.enhancedDescription.slice(0, 120)}...`);
    enhancedOutputs.push(`[REVIEWER] 사고 단계: ${enhanced.thinkingFramework.split('\n').filter((s) => s.includes('단계')).length}단계`);
    enhancedOutputs.push(`[REVIEWER] 품질 체크리스트: ${enhanced.qualityChecklist.length}개 항목`);
    enhancedOutputs.push('');

    // 기존 CodeReviewAgent 사용 (컴파일·린트·테스트)
    const agent = new CodeReviewAgent({
      projectPath,
      stages: ['compile', 'lint', 'test'],
      verbose: false,
      autoFix: true,
      failFast: false,
    });

    const report = agent.run();
    const text = formatReportAsText(report);

    // ReviewReport의 이슈를 TaskIssue로 변환
    for (const stage of report.stages) {
      for (const issue of stage.issues) {
        issues.push({
          severity: issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info',
          message: issue.message,
          file: issue.file,
          line: issue.line,
          suggestion: issue.suggestion,
          autoFixable: issue.severity === 'warning',
        });
      }
    }

    // ── SharedKnowledge: Planner 아키텍처 가이드라인 참조 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      enhancedOutputs.push('[REVIEWER] ── SharedKnowledge Context Injected ──');
      enhancedOutputs.push(`[REVIEWER] 이전 Phase 인사이트 ${sharedCtx.length}자 참조`);
    }

    // 코드 스멜 심층 분석 + 자동 수정
    const smellResult = this.detectAndFixCodeSmells(projectPath);
    issues.push(...smellResult.issues);
    enhancedOutputs.push(...smellResult.logs);

    // ── SharedKnowledge: 코드 스멜 인사이트 저장 ──
    if (smellResult.issues.length > 0) {
      this.addInsight('code-pattern', 'medium', `코드 스멜 ${smellResult.issues.length}건 감지, ${smellResult.fixedCount}건 자동 수정`,
        smellResult.issues.map((i) => i.message).join('\n'),
        task, smellResult.issues.map((i) => i.file || '').filter(Boolean));
    }

    // AI 심층 코드 리뷰 (LLM 기반)
    const aiReview = this.runAICodeReview(projectPath);
    issues.push(...aiReview.issues);
    enhancedOutputs.push(...aiReview.logs);

    // ── SharedKnowledge: AI 리뷰 인사이트 저장 ──
    if (aiReview.issues.length > 0) {
      this.addInsight('code-pattern', 'high', `AI 심층 리뷰 ${aiReview.issues.length}건`,
        aiReview.issues.map((i) => i.message).join('\n'),
        task, aiReview.issues.map((i) => i.file || '').filter(Boolean));
    }

    // 복잡도 분석
    const complexityIssues = this.analyzeComplexity(projectPath);
    issues.push(...complexityIssues);

    // ── SharedKnowledge: 복잡도 인사이트 저장 ──
    if (complexityIssues.length > 0) {
      this.addInsight('performance', 'medium', `복잡도 이슈 ${complexityIssues.length}건`,
        complexityIssues.map((i) => i.message).join('\n'),
        task, complexityIssues.map((i) => i.file || '').filter(Boolean));
    }

    // 트렌드 분석 추가
    const trendReport = agent.getTrendReport();

    const artifacts: string[] = [];

    // 학습 인사이트는 artifacts로 분류 (실패 판정에 영향 없음)
    if (report.insights && report.insights.length > 0) {
      for (const insight of report.insights) {
        artifacts.push(`[LEARNING] ${insight}`);
      }
    }

    if (report.fixReport) {
      artifacts.push(`Auto-fixed ${report.fixReport.lintFixedCount} lint issues`);
      if (report.fixReport.suggestions.length > 0) {
        artifacts.push(...report.fixReport.suggestions.map((s) => `Suggestion: ${s}`));
      }
    }

    // 코드 스멜 수정 결과 artifacts
    if (smellResult.fixedCount > 0) {
      artifacts.push(`[AUTO-FIX] CodeTransformer로 ${smellResult.fixedCount}건 코드 스멜 자동 수정 완료`);
    }
    if (smellResult.issues.length > smellResult.fixedCount) {
      artifacts.push(`[CODE-QUALITY] ${smellResult.issues.length - smellResult.fixedCount} code smell(s) remaining (수동 수정 필요)`);
    }

    // 프롬프트 강화 정보를 artifacts에 추가
    artifacts.push(`[PROMPT-ENHANCED] ${enhanced.qualityChecklist.length}개 품질 체크리스트 적용됨`);

    // 실제 error/critical 이슈만 실패로 판정
    const hasRealErrors = issues.some((i) => i.severity === 'error' || i.severity === 'critical');

    return {
      success: !hasRealErrors,
      output: enhancedOutputs.join('\n') + text + '\n\n' + trendReport,
      artifacts,
      issues,
      duration: report.duration,
    };
  }

  /**
   * 코드 스멜 탐지 + CodeTransformer를 통한 자동 수정
   *
   * 흐름: 패턴 매칭 → 수정 가능 여부 분류 → CodeTransformer 실행 → 결과 리포트
   */
  private detectAndFixCodeSmells(projectPath: string): {
    issues: TaskResult['issues'];
    logs: string[];
    fixedCount: number;
  } {
    const issues: TaskResult['issues'] = [];
    const logs: string[] = [];
    let fixedCount = 0;

    // 파일별로 감지된 스멜과 수정 가능 변환 타입 수집
    const fileSmells = new Map<string, { smells: typeof CODE_SMELL_PATTERNS; transforms: Set<TransformType> }>();

    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\./i.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(projectPath, fullPath);
              for (const smell of CODE_SMELL_PATTERNS) {
                smell.pattern.lastIndex = 0;
                const matches = content.match(smell.pattern);
                if (matches && matches.length > 0) {
                  const transformType = FIXABLE_SMELL_MAP[smell.name];
                  const isFixable = !!transformType;

                  issues.push(this.createIssue(smell.severity,
                    `[Code Smell] ${smell.name} (${matches.length}건) — ${smell.advice}`,
                    { file: relPath, autoFixable: isFixable },
                  ));

                  // 수정 가능한 스멜이면 파일별 변환 목록에 추가
                  if (isFixable) {
                    if (!fileSmells.has(relPath)) {
                      fileSmells.set(relPath, { smells: [], transforms: new Set() });
                    }
                    fileSmells.get(relPath)!.transforms.add(transformType);
                  }
                }
              }
            } catch (err: unknown) {
              if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] code smell file read:', err instanceof Error ? err.message : String(err)); }
            }
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] code smell scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };

    scanDir(projectPath, 0);

    // CodeTransformer로 수정 가능한 스멜 자동 수정
    if (fileSmells.size > 0) {
      logs.push('[REVIEWER] ── CodeTransformer 자동 수정 실행 ──');
      try {
        // 지연 로딩: 테스트 환경에서 typescript 모듈 로드 오류 방지
        const { CodeTransformer } = require('../code-transformer');
        const transformer = new CodeTransformer(projectPath);
        for (const [file, data] of fileSmells) {
          const transforms = Array.from(data.transforms);
          const result = transformer.transformFile(file, transforms);
          if (result.success && result.appliedCount > 0) {
            fixedCount += result.appliedCount;
            logs.push(`[REVIEWER] ✓ ${file}: ${result.appliedCount}건 수정 (${transforms.join(', ')})`);
            for (const change of result.changes) {
              logs.push(`[REVIEWER]   → ${change.description}`);
            }
          }
        }
        if (fixedCount > 0) {
          logs.push(`[REVIEWER] ✅ 총 ${fixedCount}건 코드 스멜 자동 수정 완료`);
        } else {
          logs.push(`[REVIEWER] ℹ️  수정 가능한 스멜이 있으나 변환 적용 없음 (이미 정리됨)`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logs.push(`[REVIEWER] ⚠️  CodeTransformer 실행 실패: ${msg}`);
      }
    }

    return { issues, logs, fixedCount };
  }

  /**
   * AI 심층 코드 리뷰 — LLM 기반 코드 품질 분석
   *
   * 정규식으로 잡지 못하는 이슈를 AI가 분석합니다:
   *  · SOLID 원칙 위반
   *  · 설계 패턴 오용
   *  · 네이밍 컨벤션 문제
   *  · 비즈니스 로직 결함
   *  · 성능 병목 가능성
   */
  private runAICodeReview(projectPath: string): {
    issues: TaskResult['issues'];
    logs: string[];
  } {
    const issues: TaskResult['issues'] = [];
    const logs: string[] = [];

    if (!this.hasAIProvider()) {
      logs.push('[REVIEWER] AI 프로바이더 없음 — 정규식 기반 분석만 수행');
      return { issues, logs };
    }

    logs.push('[REVIEWER] ── AI 심층 코드 리뷰 시작 ──');

    // 분석 대상 소스 파일 수집 (최대 5개, 가장 큰 파일 우선)
    const sourceFiles: { relPath: string; content: string; lines: number }[] = [];
    const collectFiles = (dir: string, depth: number) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec|d)\./i.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n').length;
              if (lines > 20) { // 20줄 미만은 분석 가치 낮음
                sourceFiles.push({ relPath: path.relative(projectPath, fullPath), content, lines });
              }
            } catch (err: unknown) {
              if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] AI review file read:', err instanceof Error ? err.message : String(err)); }
            }
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] AI review scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };
    collectFiles(projectPath, 0);

    // 파일 크기 순 정렬, 상위 5개
    sourceFiles.sort((a, b) => b.lines - a.lines);
    const targets = sourceFiles.slice(0, 5);

    if (targets.length === 0) {
      logs.push('[REVIEWER] 분석 대상 소스 파일 없음');
      return { issues, logs };
    }

    // AI에게 코드 리뷰 요청
    const codeSnippets = targets.map((f) => {
      const truncated = f.content.length > 3000 ? f.content.slice(0, 3000) + '\n// ... (truncated)' : f.content;
      return `=== ${f.relPath} (${f.lines}줄) ===\n${truncated}`;
    }).join('\n\n');

    const systemPrompt = `당신은 15년 경력의 시니어 코드 리뷰어입니다.
다음 코드를 분석하여 JSON 배열로 이슈를 보고하세요.

분석 항목:
1. SOLID 원칙 위반 (단일 책임, 개방-폐쇄, 리스코프, 인터페이스 분리, 의존성 역전)
2. 설계 패턴 오용 또는 누락
3. 에러 처리 부족 또는 잘못된 에러 처리
4. 성능 병목 (불필요한 반복, 메모리 누수 가능성, O(n²) 이상)
5. 네이밍 컨벤션 위반
6. 코드 중복
7. 타입 안전성 문제

응답 형식 (JSON만 출력):
[
  {
    "file": "파일경로",
    "severity": "warning" | "info",
    "message": "[카테고리] 구체적인 이슈 설명",
    "suggestion": "수정 방안"
  }
]

이슈가 없으면 빈 배열 []을 반환하세요. 최대 10개까지만 보고하세요.`;

    const aiResponse = this.callAISync(systemPrompt, codeSnippets, { maxTokens: 2048, timeout: 60000 });

    if (!aiResponse) {
      logs.push('[REVIEWER] AI 응답 없음 — 정규식 분석 결과만 사용');
      return { issues, logs };
    }

    // AI 응답 파싱
    try {
      // JSON 배열 추출 (코드블록이나 앞뒤 텍스트 제거)
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logs.push('[REVIEWER] AI 응답에서 JSON 배열을 추출할 수 없음');
      } else {
        const aiIssues: Array<{ file?: string; severity?: string; message?: string; suggestion?: string }> = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(aiIssues)) throw new Error('AI 응답이 배열이 아님');
        for (const ai of aiIssues) {
          if (!ai.message) continue;
          const sev = ai.severity === 'warning' ? 'warning' as const : 'info' as const;
          issues.push(this.createIssue(sev,
            `[AI Review] ${ai.message}`,
            { file: ai.file, suggestion: ai.suggestion, autoFixable: false },
          ));
        }
        logs.push(`[REVIEWER] ✅ AI 심층 분석 완료: ${issues.length}건 이슈 발견 (${targets.length}개 파일 분석)`);
      }
    } catch (err: unknown) {
      logs.push(`[REVIEWER] ⚠️  AI 응답 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { issues, logs };
  }

  /** 복잡도 분석 — 대형 파일·함수 탐지 */
  private analyzeComplexity(projectPath: string): TaskResult['issues'] {
    const issues: TaskResult['issues'] = [];
    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\./i.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              const relPath = path.relative(projectPath, fullPath);

              // 대형 파일 (300줄+)
              if (lines.length > 300) {
                issues.push(this.createIssue('info',
                  `[Complexity] ${relPath}: ${lines.length}줄 — 모듈 분리를 검토하세요`,
                  { file: relPath, autoFixable: false },
                ));
              }

              // 긴 함수 탐지 (함수 시작~끝 사이 50줄+)
              const funcMatches = content.matchAll(/(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>)\s*(?:\{)?/g);
              for (const match of funcMatches) {
                if (match.index === undefined) continue;
                const startLine = content.slice(0, match.index).split('\n').length;
                // 간이 추정: 다음 같은 수준 함수까지의 줄 수
                const remaining = content.slice(match.index);
                const braceCount = remaining.indexOf('\n}');
                if (braceCount > 0) {
                  const funcLines = remaining.slice(0, braceCount).split('\n').length;
                  if (funcLines > 50) {
                    issues.push(this.createIssue('info',
                      `[Complexity] ${relPath}:${startLine} 함수 약 ${funcLines}줄 — 함수를 분리하세요`,
                      { file: relPath, line: startLine, autoFixable: false },
                    ));
                  }
                }
              }
            } catch (err: unknown) {
              if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] complexity file read:', err instanceof Error ? err.message : String(err)); }
            }
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[ReviewerAgent] complexity scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };
    scanDir(projectPath, 0);
    return issues;
  }
}
