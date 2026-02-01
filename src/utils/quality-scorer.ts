/**
 * Quality Scorer — 6개 카테고리 기반 프로젝트 품질 점수 계산
 */

import fs from 'fs';
import path from 'path';
import { CodeReviewAgent } from '../agent';
import { loadConfig } from './config-loader';

export interface CategoryScore {
  name: string;
  nameKo: string;
  score: number;
  maxScore: number;
  details: string[];
}

export interface QualityScoreResult {
  total: number;
  maxTotal: number;
  grade: string;
  categories: CategoryScore[];
  timestamp: string;
}

/**
 * 리뷰 리포트를 기반으로 6개 카테고리 품질 점수를 계산합니다.
 */
export function computeQualityScore(projectPath: string): QualityScoreResult {
  const { config: fileConfig } = loadConfig(projectPath);
  const agent = new CodeReviewAgent({
    ...(fileConfig ?? {}),
    projectPath,
    stages: ['compile', 'lint', 'test'],
    verbose: false,
    autoFix: false,
    failFast: false,
  });

  const report = agent.run();

  const compileStage = report.stages.find(s => s.stage === 'compile');
  const lintStage = report.stages.find(s => s.stage === 'lint');
  const testStage = report.stages.find(s => s.stage === 'test');

  // 1. 보안 (Security) — 20점
  const security = scoreSecurityCategory(projectPath, lintStage);

  // 2. 에러핸들링 (Error Handling) — 20점
  const errorHandling = scoreErrorHandlingCategory(projectPath, lintStage);

  // 3. 타입안전성 (Type Safety) — 15점
  const typeSafety = scoreTypeSafetyCategory(compileStage);

  // 4. 테스트커버리지 (Test Coverage) — 20점
  const testCoverage = scoreTestCoverageCategory(testStage);

  // 5. 코드품질 (Code Quality) — 15점
  const codeQuality = scoreCodeQualityCategory(lintStage);

  // 6. 아키텍처 (Architecture) — 10점
  const architecture = scoreArchitectureCategory(projectPath);

  const categories = [security, errorHandling, typeSafety, testCoverage, codeQuality, architecture];
  const total = categories.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = categories.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    total,
    maxTotal,
    grade: getGrade(total, maxTotal),
    categories,
    timestamp: new Date().toISOString(),
  };
}

interface StageResult {
  stage: string;
  status: string;
  issues: Array<{
    severity: string;
    message: string;
    file?: string;
    rule?: string;
  }>;
  duration: number;
}

function scoreSecurityCategory(projectPath: string, lintStage: StageResult | undefined): CategoryScore {
  const maxScore = 20;
  let score = maxScore;
  const details: string[] = [];

  // 린트 결과에서 보안 관련 규칙 위반 체크
  const securityRules = ['no-eval', 'no-implied-eval', 'no-new-func', 'security'];
  if (lintStage) {
    const secIssues = lintStage.issues.filter(i =>
      securityRules.some(r => (i.rule || '').includes(r) || i.message.toLowerCase().includes('eval'))
    );
    if (secIssues.length > 0) {
      score -= Math.min(10, secIssues.length * 2);
      details.push(`보안 관련 린트 이슈 ${secIssues.length}개`);
    }
  }

  // .env 파일이 gitignore에 있는지 체크
  const gitignorePath = path.join(projectPath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes('.env')) {
      details.push('.env 파일 gitignore 포함');
    } else {
      score -= 3;
      details.push('.env 파일 gitignore 미포함');
    }
  }

  // 하드코딩 시크릿 체크 (간단한 패턴)
  const srcDir = path.join(projectPath, 'src');
  if (fs.existsSync(srcDir)) {
    const hasHardcodedSecrets = checkHardcodedSecrets(srcDir);
    if (hasHardcodedSecrets) {
      score -= 5;
      details.push('하드코딩된 시크릿 의심 패턴 발견');
    } else {
      details.push('하드코딩 시크릿 없음');
    }
  }

  if (details.length === 0 || score === maxScore) {
    details.push('보안 이슈 없음');
  }

  return { name: 'security', nameKo: '보안', score: Math.max(0, score), maxScore, details };
}

function checkHardcodedSecrets(dirPath: string): boolean {
  const secretPatterns = [
    /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/i,
  ];

  try {
    const files = readdirRecursiveSync(dirPath, ['.ts', '.js']);
    for (const file of files.slice(0, 50)) {
      if (file.includes('.test.') || file.includes('node_modules')) continue;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) return true;
        }
      } catch (_err: unknown) {
        // 파일 읽기 실패 무시
      }
    }
  } catch (_err: unknown) {
    // 디렉토리 읽기 실패
  }
  return false;
}

function scoreErrorHandlingCategory(_projectPath: string, lintStage: StageResult | undefined): CategoryScore {
  const maxScore = 20;
  let score = maxScore;
  const details: string[] = [];

  if (lintStage) {
    // 에러 핸들링 관련 린트 규칙 체크
    const errorRules = ['no-empty', 'no-unused-catch', 'no-useless-catch'];
    const errorIssues = lintStage.issues.filter(i =>
      errorRules.some(r => (i.rule || '').includes(r))
    );
    if (errorIssues.length > 0) {
      score -= Math.min(10, errorIssues.length * 2);
      details.push(`에러핸들링 린트 이슈 ${errorIssues.length}개`);
    }

    // 전체 에러 수로 감점
    const errors = lintStage.issues.filter(i => i.severity === 'error');
    if (errors.length > 0) {
      score -= Math.min(5, errors.length);
      details.push(`린트 에러 ${errors.length}개`);
    }
  }

  if (details.length === 0 || score === maxScore) {
    details.push('에러핸들링 이슈 없음');
  }

  return { name: 'errorHandling', nameKo: '에러핸들링', score: Math.max(0, score), maxScore, details };
}

function scoreTypeSafetyCategory(compileStage: StageResult | undefined): CategoryScore {
  const maxScore = 15;
  let score = maxScore;
  const details: string[] = [];

  if (!compileStage) {
    score = 0;
    details.push('컴파일 스테이지 미실행');
  } else if (compileStage.status === 'fail') {
    const errorCount = compileStage.issues.filter(i => i.severity === 'error').length;
    score -= Math.min(15, errorCount * 3);
    details.push(`타입 에러 ${errorCount}개`);
  } else {
    details.push('타입 에러 없음');
  }

  return { name: 'typeSafety', nameKo: '타입안전성', score: Math.max(0, score), maxScore, details };
}

function scoreTestCoverageCategory(testStage: StageResult | undefined): CategoryScore {
  const maxScore = 20;
  let score = maxScore;
  const details: string[] = [];

  if (!testStage) {
    score = 0;
    details.push('테스트 스테이지 미실행');
  } else if (testStage.status === 'fail') {
    const failedTests = testStage.issues.filter(i => i.severity === 'error').length;
    score -= Math.min(20, failedTests * 4);
    details.push(`테스트 실패 ${failedTests}건`);
  } else {
    details.push('전체 테스트 통과');
  }

  return { name: 'testCoverage', nameKo: '테스트커버리지', score: Math.max(0, score), maxScore, details };
}

function scoreCodeQualityCategory(lintStage: StageResult | undefined): CategoryScore {
  const maxScore = 15;
  let score = maxScore;
  const details: string[] = [];

  if (!lintStage) {
    score = 0;
    details.push('린트 스테이지 미실행');
  } else {
    const warnings = lintStage.issues.filter(i => i.severity === 'warning').length;
    const errors = lintStage.issues.filter(i => i.severity === 'error').length;
    const totalIssues = warnings + errors;

    if (errors > 0) {
      score -= Math.min(10, errors * 2);
      details.push(`린트 에러 ${errors}개`);
    }
    if (warnings > 0) {
      score -= Math.min(5, Math.ceil(warnings / 3));
      details.push(`린트 경고 ${warnings}개`);
    }
    if (totalIssues === 0) {
      details.push('린트 이슈 없음');
    }
  }

  return { name: 'codeQuality', nameKo: '코드품질', score: Math.max(0, score), maxScore, details };
}

function scoreArchitectureCategory(projectPath: string): CategoryScore {
  const maxScore = 10;
  let score = maxScore;
  const details: string[] = [];

  const srcDir = path.join(projectPath, 'src');
  if (!fs.existsSync(srcDir)) {
    score -= 3;
    details.push('src 디렉토리 없음');
    return { name: 'architecture', nameKo: '아키텍처', score: Math.max(0, score), maxScore, details };
  }

  // package.json 존재 여부
  if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    score -= 2;
    details.push('package.json 없음');
  }

  // tsconfig.json 존재 여부
  if (!fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    score -= 2;
    details.push('tsconfig.json 없음');
  } else {
    details.push('TypeScript 설정 존재');
  }

  // 테스트 파일 존재 여부
  try {
    const testFiles = readdirRecursiveSync(srcDir, ['.test.ts', '.test.js', '.spec.ts', '.spec.js']);
    if (testFiles.length > 0) {
      details.push(`테스트 파일 ${testFiles.length}개`);
    } else {
      score -= 3;
      details.push('테스트 파일 없음');
    }
  } catch (_err: unknown) {
    // 디렉토리 읽기 실패
  }

  // 모듈 분리 확인 (서브디렉토리 수)
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).length;
    if (dirs >= 3) {
      details.push(`모듈 분리 양호 (${dirs}개 서브디렉토리)`);
    } else if (dirs >= 1) {
      details.push(`모듈 분리 (${dirs}개 서브디렉토리)`);
    } else {
      score -= 2;
      details.push('모듈 분리 없음');
    }
  } catch (_err: unknown) {
    // 디렉토리 읽기 실패
  }

  return { name: 'architecture', nameKo: '아키텍처', score: Math.max(0, score), maxScore, details };
}

function readdirRecursiveSync(dirPath: string, extensions: string[]): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...readdirRecursiveSync(fullPath, extensions));
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (_err: unknown) {
    // 디렉토리 읽기 실패 무시
  }
  return results;
}

function getGrade(total: number, maxTotal: number): string {
  const ratio = total / maxTotal;
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.9) return 'A+';
  if (ratio >= 0.8) return 'A';
  if (ratio >= 0.7) return 'B+';
  if (ratio >= 0.6) return 'B';
  if (ratio >= 0.5) return 'C';
  return 'D';
}
