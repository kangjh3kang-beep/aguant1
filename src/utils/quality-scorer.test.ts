import fs from 'fs';

// ─── Mocks ───
const mockRun = jest.fn();
jest.mock('../agent', () => ({
  CodeReviewAgent: jest.fn().mockImplementation(() => ({
    run: mockRun,
  })),
}));

jest.mock('./config-loader', () => ({
  loadConfig: jest.fn().mockReturnValue({ config: null, errors: [] }),
}));

import { computeQualityScore } from './quality-scorer';

// ─── Helpers ───

function buildReport(overrides: Record<string, unknown> = {}) {
  return {
    projectPath: '/test',
    timestamp: '2025-01-01T00:00:00.000Z',
    stages: [
      { stage: 'compile', status: 'pass', issues: [], duration: 50, summary: 'OK' },
      { stage: 'lint', status: 'pass', issues: [], duration: 30, summary: 'OK' },
      { stage: 'test', status: 'pass', issues: [], duration: 100, summary: 'OK' },
    ],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    passed: true,
    duration: 180,
    fixReport: null,
    insights: [],
    ...overrides,
  };
}

// ─── Test Suite ───

describe('quality-scorer', () => {
  const PROJECT_PATH = '/home/user/test-project';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRun.mockReturnValue(buildReport());

    // Mock filesystem
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('.gitignore')) return true;
      if (s.endsWith('package.json')) return true;
      if (s.endsWith('tsconfig.json')) return true;
      if (s.endsWith('/src')) return true;
      return false;
    });

    jest.spyOn(fs, 'readFileSync').mockImplementation(((p: unknown) => {
      const s = String(p);
      if (s.endsWith('.gitignore')) return '.env\nnode_modules\n';
      return '';
    }) as unknown as typeof fs.readFileSync);

    jest.spyOn(fs, 'readdirSync').mockImplementation(((p: unknown) => {
      const s = String(p);
      // src/ 디렉토리: 서브디렉토리 + 파일 반환
      if (s.endsWith('/src')) {
        return [
          { name: 'utils', isDirectory: () => true, isFile: () => false },
          { name: 'orchestrator', isDirectory: () => true, isFile: () => false },
          { name: 'web', isDirectory: () => true, isFile: () => false },
          { name: 'agent.test.ts', isDirectory: () => false, isFile: () => true },
          { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        ];
      }
      // 서브디렉토리: 빈 배열 (재귀 종료)
      return [];
    }) as unknown as typeof fs.readdirSync);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a valid QualityScoreResult structure', () => {
    const result = computeQualityScore(PROJECT_PATH);

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('maxTotal', 100);
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('categories');
    expect(result).toHaveProperty('timestamp');
    expect(result.categories).toHaveLength(6);
  });

  it('should return perfect score for clean project', () => {
    const result = computeQualityScore(PROJECT_PATH);

    expect(result.total).toBe(100);
    expect(result.grade).toBe('S');
  });

  it('should include all 6 category names', () => {
    const result = computeQualityScore(PROJECT_PATH);
    const names = result.categories.map(c => c.name);

    expect(names).toEqual([
      'security', 'errorHandling', 'typeSafety',
      'testCoverage', 'codeQuality', 'architecture',
    ]);
  });

  it('should deduct typeSafety score for compile errors', () => {
    mockRun.mockReturnValue(buildReport({
      stages: [
        {
          stage: 'compile', status: 'fail',
          issues: [
            { severity: 'error', message: 'TS2304: Cannot find name', file: 'a.ts' },
            { severity: 'error', message: 'TS2345: Type mismatch', file: 'b.ts' },
          ],
          duration: 50,
        },
        { stage: 'lint', status: 'pass', issues: [], duration: 30 },
        { stage: 'test', status: 'pass', issues: [], duration: 100 },
      ],
    }));

    const result = computeQualityScore(PROJECT_PATH);
    const typeSafety = result.categories.find(c => c.name === 'typeSafety')!;

    expect(typeSafety.score).toBeLessThan(15);
    expect(typeSafety.details).toContainEqual(expect.stringContaining('타입 에러'));
  });

  it('should deduct testCoverage score for test failures', () => {
    mockRun.mockReturnValue(buildReport({
      stages: [
        { stage: 'compile', status: 'pass', issues: [], duration: 50 },
        { stage: 'lint', status: 'pass', issues: [], duration: 30 },
        {
          stage: 'test', status: 'fail',
          issues: [
            { severity: 'error', message: 'Test suite failed: app.test.ts', file: 'app.test.ts' },
          ],
          duration: 100,
        },
      ],
    }));

    const result = computeQualityScore(PROJECT_PATH);
    const testCoverage = result.categories.find(c => c.name === 'testCoverage')!;

    expect(testCoverage.score).toBeLessThan(20);
    expect(testCoverage.details).toContainEqual(expect.stringContaining('테스트 실패'));
  });

  it('should deduct codeQuality score for lint warnings', () => {
    mockRun.mockReturnValue(buildReport({
      stages: [
        { stage: 'compile', status: 'pass', issues: [], duration: 50 },
        {
          stage: 'lint', status: 'pass',
          issues: Array(10).fill({
            severity: 'warning', message: 'no-unused-vars', file: 'a.ts', rule: 'no-unused-vars',
          }),
          duration: 30,
        },
        { stage: 'test', status: 'pass', issues: [], duration: 100 },
      ],
    }));

    const result = computeQualityScore(PROJECT_PATH);
    const codeQuality = result.categories.find(c => c.name === 'codeQuality')!;

    expect(codeQuality.score).toBeLessThan(15);
    expect(codeQuality.details).toContainEqual(expect.stringContaining('린트 경고'));
  });

  it('should deduct security score for eval-related rules', () => {
    mockRun.mockReturnValue(buildReport({
      stages: [
        { stage: 'compile', status: 'pass', issues: [], duration: 50 },
        {
          stage: 'lint', status: 'pass',
          issues: [
            { severity: 'error', message: 'Unexpected eval', file: 'a.ts', rule: 'no-eval' },
          ],
          duration: 30,
        },
        { stage: 'test', status: 'pass', issues: [], duration: 100 },
      ],
    }));

    const result = computeQualityScore(PROJECT_PATH);
    const security = result.categories.find(c => c.name === 'security')!;

    expect(security.score).toBeLessThan(20);
    expect(security.details).toContainEqual(expect.stringContaining('보안 관련'));
  });

  it('should deduct architecture score when tsconfig.json is missing', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith('tsconfig.json')) return false;
      if (s.endsWith('.gitignore')) return true;
      if (s.endsWith('package.json')) return true;
      if (s.endsWith('/src')) return true;
      return false;
    });

    const result = computeQualityScore(PROJECT_PATH);
    const architecture = result.categories.find(c => c.name === 'architecture')!;

    expect(architecture.score).toBeLessThan(10);
    expect(architecture.details).toContainEqual(expect.stringContaining('tsconfig.json'));
  });

  it('should assign correct grades based on total score', () => {
    // S grade (>= 95%)
    let result = computeQualityScore(PROJECT_PATH);
    expect(result.grade).toBe('S');

    // Simulate lower score by having compile fail
    mockRun.mockReturnValue(buildReport({
      stages: [
        {
          stage: 'compile', status: 'fail',
          issues: Array(5).fill({ severity: 'error', message: 'type error' }),
          duration: 50,
        },
        {
          stage: 'lint', status: 'pass',
          issues: Array(5).fill({ severity: 'error', message: 'lint error', rule: 'no-empty' }),
          duration: 30,
        },
        { stage: 'test', status: 'fail',
          issues: Array(3).fill({ severity: 'error', message: 'test fail' }),
          duration: 100,
        },
      ],
    }));

    result = computeQualityScore(PROJECT_PATH);
    expect(result.total).toBeLessThan(100);
    expect(['A+', 'A', 'B+', 'B', 'C', 'D']).toContain(result.grade);
  });

  it('should include Korean names for all categories', () => {
    const result = computeQualityScore(PROJECT_PATH);
    const koNames = result.categories.map(c => c.nameKo);

    expect(koNames).toEqual([
      '보안', '에러핸들링', '타입안전성',
      '테스트커버리지', '코드품질', '아키텍처',
    ]);
  });

  it('should handle missing src directory for architecture', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith('/src')) return false;
      if (s.endsWith('.gitignore')) return true;
      if (s.endsWith('package.json')) return true;
      if (s.endsWith('tsconfig.json')) return true;
      return false;
    });

    const result = computeQualityScore(PROJECT_PATH);
    const arch = result.categories.find(c => c.name === 'architecture')!;

    expect(arch.score).toBeLessThan(10);
    expect(arch.details).toContainEqual(expect.stringContaining('src 디렉토리'));
  });
});
