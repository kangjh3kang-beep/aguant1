import fs from 'fs';
import path from 'path';
import { ReviewReport } from '../types';
import { agWarn } from './logger';

const HISTORY_DIR = '.ag-review';
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 100;

export interface HistoryEntry {
  id: string;
  timestamp: string;
  gitBranch?: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  totalIssues: number;
  duration: number;
  stages: Array<{
    stage: string;
    status: string;
    issueCount: number;
    duration: number;
  }>;
  fixReport?: {
    lintFixedCount: number;
    snapshotsUpdated: boolean;
    suggestionCount: number;
  };
}

export interface ReviewHistory {
  projectPath: string;
  entries: HistoryEntry[];
  lastUpdated: string;
}

export interface TrendAnalysis {
  totalRuns: number;
  passRate: number;
  errorTrend: 'improving' | 'stable' | 'degrading';
  warningTrend: 'improving' | 'stable' | 'degrading';
  durationTrend: 'faster' | 'stable' | 'slower';
  avgErrors: number;
  avgWarnings: number;
  avgDuration: number;
  recentErrors: number;
  recentWarnings: number;
  recentDuration: number;
  recurringIssues: string[];
  improvements: string[];
  regressions: string[];
}

/**
 * 히스토리 파일 경로를 반환합니다.
 */
export function getHistoryPath(projectPath: string): string {
  return path.join(projectPath, HISTORY_DIR, HISTORY_FILE);
}

/**
 * 프로젝트의 리뷰 히스토리를 로드합니다.
 */
export function loadHistory(projectPath: string): ReviewHistory {
  const historyPath = getHistoryPath(projectPath);

  if (!fs.existsSync(historyPath)) {
    return { projectPath, entries: [], lastUpdated: new Date().toISOString() };
  }

  try {
    const raw = fs.readFileSync(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    // 구조 검증: projectPath와 entries 배열이 있어야 유효
    if (parsed && typeof parsed.projectPath === 'string' && Array.isArray(parsed.entries)) {
      return parsed as ReviewHistory;
    }
    return { projectPath, entries: [], lastUpdated: new Date().toISOString() };
  } catch (_err: unknown) {
    return { projectPath, entries: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * 리뷰 결과를 히스토리에 저장합니다.
 */
export function saveToHistory(projectPath: string, report: ReviewReport): HistoryEntry {
  const history = loadHistory(projectPath);

  const entry: HistoryEntry = {
    id: generateId(),
    timestamp: report.timestamp,
    gitBranch: report.gitBranch,
    passed: report.passed,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    totalIssues: report.totalIssues,
    duration: report.duration,
    stages: report.stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      issueCount: s.issues.length,
      duration: s.duration,
    })),
    fixReport: report.fixReport
      ? {
          lintFixedCount: report.fixReport.lintFixedCount,
          snapshotsUpdated: report.fixReport.snapshotsUpdated,
          suggestionCount: report.fixReport.suggestions.length,
        }
      : undefined,
  };

  history.entries.push(entry);

  // 최대 보관 수 유지
  if (history.entries.length > MAX_HISTORY) {
    history.entries = history.entries.slice(-MAX_HISTORY);
  }

  history.lastUpdated = new Date().toISOString();

  // 디렉토리 생성 후 저장
  const historyDir = path.join(projectPath, HISTORY_DIR);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  fs.writeFileSync(getHistoryPath(projectPath), JSON.stringify(history, null, 2), 'utf-8');

  // .gitignore에 추가 (이미 없다면)
  ensureGitignore(projectPath);

  return entry;
}

/**
 * 이전 리뷰와 현재 리뷰를 비교 분석합니다.
 */
export function compareWithPrevious(
  projectPath: string,
  current: ReviewReport,
): string[] {
  const history = loadHistory(projectPath);
  const insights: string[] = [];

  if (history.entries.length === 0) {
    insights.push('First review recorded. Future runs will compare against this baseline.');
    return insights;
  }

  const prev = history.entries[history.entries.length - 1];

  // 에러 비교
  const errorDiff = current.errorCount - prev.errorCount;
  if (errorDiff < 0) {
    insights.push(`Errors reduced: ${prev.errorCount} -> ${current.errorCount} (${Math.abs(errorDiff)} fixed)`);
  } else if (errorDiff > 0) {
    insights.push(`New errors introduced: ${prev.errorCount} -> ${current.errorCount} (+${errorDiff})`);
  } else {
    insights.push(`Errors unchanged: ${current.errorCount}`);
  }

  // 경고 비교
  const warnDiff = current.warningCount - prev.warningCount;
  if (warnDiff < 0) {
    insights.push(`Warnings reduced: ${prev.warningCount} -> ${current.warningCount} (${Math.abs(warnDiff)} fixed)`);
  } else if (warnDiff > 0) {
    insights.push(`New warnings: ${prev.warningCount} -> ${current.warningCount} (+${warnDiff})`);
  }

  // 통과 상태 변화
  if (!prev.passed && current.passed) {
    insights.push('Status IMPROVED: Previously failing, now passing!');
  } else if (prev.passed && !current.passed) {
    insights.push('REGRESSION detected: Previously passing, now failing.');
  }

  // 속도 비교
  const speedDiff = current.duration - prev.duration;
  const speedPct = prev.duration > 0 ? Math.round((speedDiff / prev.duration) * 100) : 0;
  if (Math.abs(speedPct) > 10) {
    if (speedDiff < 0) {
      insights.push(`Performance improved: ${Math.abs(speedPct)}% faster`);
    } else {
      insights.push(`Performance degraded: ${speedPct}% slower`);
    }
  }

  // 스테이지별 비교
  for (const stage of current.stages) {
    const prevStage = prev.stages.find((s) => s.stage === stage.stage);
    if (prevStage) {
      if (prevStage.status === 'fail' && stage.status === 'pass') {
        insights.push(`[${stage.stage.toUpperCase()}] Fixed! Was failing, now passing.`);
      } else if (prevStage.status === 'pass' && stage.status === 'fail') {
        insights.push(`[${stage.stage.toUpperCase()}] Regression! Was passing, now failing.`);
      }
    }
  }

  return insights;
}

/**
 * 전체 히스토리에서 트렌드를 분석합니다.
 */
export function analyzeTrend(projectPath: string): TrendAnalysis {
  const history = loadHistory(projectPath);
  const entries = history.entries;
  const total = entries.length;

  if (total === 0) {
    return {
      totalRuns: 0,
      passRate: 0,
      errorTrend: 'stable',
      warningTrend: 'stable',
      durationTrend: 'stable',
      avgErrors: 0,
      avgWarnings: 0,
      avgDuration: 0,
      recentErrors: 0,
      recentWarnings: 0,
      recentDuration: 0,
      recurringIssues: [],
      improvements: [],
      regressions: [],
    };
  }

  const passCount = entries.filter((e) => e.passed).length;

  const avgErrors = entries.reduce((s, e) => s + e.errorCount, 0) / total;
  const avgWarnings = entries.reduce((s, e) => s + e.warningCount, 0) / total;
  const avgDuration = entries.reduce((s, e) => s + e.duration, 0) / total;

  // 최근 5회 vs 전체 비교
  const recentN = Math.min(5, total);
  const recent = entries.slice(-recentN);
  const recentErrors = recent.reduce((s, e) => s + e.errorCount, 0) / recentN;
  const recentWarnings = recent.reduce((s, e) => s + e.warningCount, 0) / recentN;
  const recentDuration = recent.reduce((s, e) => s + e.duration, 0) / recentN;

  const errorTrend = decideTrend(avgErrors, recentErrors);
  const warningTrend = decideTrend(avgWarnings, recentWarnings);
  const durationTrend = decideDurationTrend(avgDuration, recentDuration);

  // 개선점/퇴보 분석
  const improvements: string[] = [];
  const regressions: string[] = [];

  if (total >= 2) {
    const first = entries[0];
    const last = entries[total - 1];

    if (last.errorCount < first.errorCount) {
      improvements.push(`Errors: ${first.errorCount} -> ${last.errorCount}`);
    } else if (last.errorCount > first.errorCount) {
      regressions.push(`Errors: ${first.errorCount} -> ${last.errorCount}`);
    }

    if (last.warningCount < first.warningCount) {
      improvements.push(`Warnings: ${first.warningCount} -> ${last.warningCount}`);
    }

    if (!first.passed && last.passed) {
      improvements.push('Project now passes all checks');
    }
  }

  // 반복 이슈 감지: 3회 이상 연속 fail인 스테이지
  const recurringIssues: string[] = [];
  const stageNames = ['compile', 'lint', 'test', 'runtime'];
  for (const stageName of stageNames) {
    const failStreak = countRecentFailStreak(entries, stageName);
    if (failStreak >= 3) {
      recurringIssues.push(`${stageName}: failing for ${failStreak} consecutive runs`);
    }
  }

  return {
    totalRuns: total,
    passRate: Math.round((passCount / total) * 100),
    errorTrend,
    warningTrend,
    durationTrend,
    avgErrors: Math.round(avgErrors * 10) / 10,
    avgWarnings: Math.round(avgWarnings * 10) / 10,
    avgDuration: Math.round(avgDuration),
    recentErrors: Math.round(recentErrors * 10) / 10,
    recentWarnings: Math.round(recentWarnings * 10) / 10,
    recentDuration: Math.round(recentDuration),
    recurringIssues,
    improvements,
    regressions,
  };
}

/**
 * 트렌드를 텍스트로 포맷합니다.
 */
export function formatTrendReport(trend: TrendAnalysis): string {
  const lines: string[] = [];

  lines.push('========================================');
  lines.push('  Antigravity Review Trend Analysis');
  lines.push('========================================');
  lines.push('');
  lines.push(`  Total runs:    ${trend.totalRuns}`);
  lines.push(`  Pass rate:     ${trend.passRate}%`);
  lines.push('');
  lines.push('  Averages (all time / recent 5):');
  lines.push(`    Errors:      ${trend.avgErrors} / ${trend.recentErrors}  [${trendIcon(trend.errorTrend)}]`);
  lines.push(`    Warnings:    ${trend.avgWarnings} / ${trend.recentWarnings}  [${trendIcon(trend.warningTrend)}]`);
  lines.push(`    Duration:    ${trend.avgDuration}ms / ${trend.recentDuration}ms  [${durationIcon(trend.durationTrend)}]`);
  lines.push('');

  if (trend.recurringIssues.length > 0) {
    lines.push('  Recurring Issues:');
    for (const issue of trend.recurringIssues) {
      lines.push(`    ! ${issue}`);
    }
    lines.push('');
  }

  if (trend.improvements.length > 0) {
    lines.push('  Improvements:');
    for (const imp of trend.improvements) {
      lines.push(`    + ${imp}`);
    }
    lines.push('');
  }

  if (trend.regressions.length > 0) {
    lines.push('  Regressions:');
    for (const reg of trend.regressions) {
      lines.push(`    - ${reg}`);
    }
    lines.push('');
  }

  lines.push('========================================');
  return lines.join('\n');
}

// ── 내부 유틸 ──────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function decideTrend(overall: number, recent: number): 'improving' | 'stable' | 'degrading' {
  if (overall === 0 && recent === 0) return 'stable';
  const ratio = overall > 0 ? (recent - overall) / overall : recent > 0 ? 1 : 0;
  if (ratio < -0.15) return 'improving';
  if (ratio > 0.15) return 'degrading';
  return 'stable';
}

function decideDurationTrend(overall: number, recent: number): 'faster' | 'stable' | 'slower' {
  if (overall === 0) return 'stable';
  const ratio = (recent - overall) / overall;
  if (ratio < -0.15) return 'faster';
  if (ratio > 0.15) return 'slower';
  return 'stable';
}

function countRecentFailStreak(entries: HistoryEntry[], stageName: string): number {
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const stage = entries[i].stages.find((s) => s.stage === stageName);
    if (stage && stage.status === 'fail') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function trendIcon(t: 'improving' | 'stable' | 'degrading'): string {
  switch (t) {
    case 'improving': return 'IMPROVING';
    case 'degrading': return 'DEGRADING';
    default: return 'STABLE';
  }
}

function durationIcon(t: 'faster' | 'stable' | 'slower'): string {
  switch (t) {
    case 'faster': return 'FASTER';
    case 'slower': return 'SLOWER';
    default: return 'STABLE';
  }
}

function ensureGitignore(projectPath: string): void {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const entry = '.ag-review/';

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n${entry}\n`, 'utf-8');
      }
    }
  } catch (err: unknown) {
    // gitignore 업데이트 실패는 운영에 영향 없으나 디버깅을 위해 기록
    if (process.env.AG_DEBUG) {
      agWarn('ag-review', '.gitignore 업데이트 실패', err);
    }
  }
}
