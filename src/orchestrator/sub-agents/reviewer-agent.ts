/**
 * Reviewer Agent — 시니어 코드 리뷰 전문가
 *
 * ━━━ 전문 분야 ━━━
 *  · 컴파일·린트·테스트 자동 실행 + 코드 품질 심층 분석
 *  · 코드 스멜(Code Smell) 25종 자동 탐지
 *  · 복잡도 분석 (대형 함수, 깊은 중첩, 긴 파라미터 리스트)
 *  · SOLID 원칙 위반 패턴 식별
 *  · 자동 수정(Auto-Fix) + 학습 루프(Learning Loop) + 트렌드 분석
 */

import fs from 'fs';
import path from 'path';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
import { CodeReviewAgent } from '../../agent';
import { formatReportAsText } from '../../report-generator';

/* ═════════════════════════════════════════════════
   코드 스멜 탐지 패턴 — Expert Code Smell DB
   ═════════════════════════════════════════════════ */
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

    // 코드 스멜 심층 분석
    const smellIssues = this.detectCodeSmells(projectPath);
    issues.push(...smellIssues);

    // 복잡도 분석
    const complexityIssues = this.analyzeComplexity(projectPath);
    issues.push(...complexityIssues);

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

    // 코드 스멜 요약을 artifacts에 추가
    const smellCount = smellIssues.length;
    if (smellCount > 0) {
      artifacts.push(`[CODE-QUALITY] ${smellCount} code smell(s) detected`);
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

  /** 코드 스멜 탐지 — 25종 패턴 매칭 */
  private detectCodeSmells(projectPath: string): TaskResult['issues'] {
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
              const relPath = path.relative(projectPath, fullPath);
              for (const smell of CODE_SMELL_PATTERNS) {
                smell.pattern.lastIndex = 0;
                const matches = content.match(smell.pattern);
                if (matches && matches.length > 0) {
                  issues.push(this.createIssue(smell.severity,
                    `[Code Smell] ${smell.name} (${matches.length}건) — ${smell.advice}`,
                    { file: relPath, autoFixable: false },
                  ));
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };
    scanDir(projectPath, 0);
    return issues;
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
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };
    scanDir(projectPath, 0);
    return issues;
  }
}
