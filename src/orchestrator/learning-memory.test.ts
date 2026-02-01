/**
 * LearningMemory 테스트
 *
 * Phase 10-D: 영속적 학습 메모리 시스템 핵심 경로 검증
 */

import fs from 'fs';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

import { LearningMemory } from './learning-memory';

describe('LearningMemory', () => {
  let memory: LearningMemory;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    memory = new LearningMemory('/test/project');
  });

  describe('recordIssue', () => {
    it('새로운 이슈를 기록한다', () => {
      memory.recordIssue("'fs' is declared but never read", 'warning', 'src/app.ts');
      const data = memory.getData();
      expect(data.issuePatterns.length).toBe(1);
      expect(data.issuePatterns[0].occurrences).toBe(1);
      expect(data.issuePatterns[0].category).toBe('warning');
    });

    it('동일 시그니처 이슈는 카운트를 증가시킨다', () => {
      memory.recordIssue("'fs' is declared but never read", 'warning', 'src/app.ts');
      memory.recordIssue("'fs' is declared but never read", 'warning', 'src/services/utils.ts');
      const data = memory.getData();
      expect(data.issuePatterns.length).toBe(1);
      expect(data.issuePatterns[0].occurrences).toBe(2);
      // src/*.ts vs src/services/*.ts → 서로 다른 디렉토리 패턴
      expect(data.issuePatterns[0].filePatterns.length).toBe(2);
    });

    it('다른 이슈는 별도 패턴으로 저장한다', () => {
      memory.recordIssue('unused import', 'warning', 'src/a.ts');
      memory.recordIssue('empty catch block', 'error', 'src/b.ts');
      const data = memory.getData();
      expect(data.issuePatterns.length).toBe(2);
    });
  });

  describe('recordFix', () => {
    it('수정 성공을 기록한다', () => {
      memory.recordIssue('unused import found', 'warning');
      memory.recordFix('unused import found', 'remove-unused-import', true, 1);
      const data = memory.getData();
      expect(data.fixRecords.length).toBe(1);
      expect(data.fixRecords[0].success).toBe(true);
      expect(data.issuePatterns[0].successfulFixes).toContain('remove-unused-import');
    });

    it('수정 실패를 기록한다', () => {
      memory.recordIssue('complex type error', 'error');
      memory.recordFix('complex type error', 'auto-fix', false, 2);
      const data = memory.getData();
      expect(data.fixRecords[0].success).toBe(false);
      expect(data.issuePatterns[0].failedFixes).toContain('auto-fix');
    });

    it('최대 500건까지 유지한다', () => {
      for (let i = 0; i < 510; i++) {
        memory.recordFix(`issue ${i}`, 'strategy', true, 1);
      }
      const data = memory.getData();
      expect(data.fixRecords.length).toBe(500);
    });
  });

  describe('recordConvention', () => {
    it('새로운 컨벤션을 등록한다', () => {
      memory.recordConvention('no-console', 'console.log 사용 금지', 'review-1', 'src/**/*.ts');
      const data = memory.getData();
      expect(data.conventions.length).toBe(1);
      expect(data.conventions[0].confidence).toBe(0.5);
    });

    it('기존 컨벤션의 신뢰도를 올린다', () => {
      memory.recordConvention('no-console', 'console.log 사용 금지', 'review-1');
      memory.recordConvention('no-console', 'console.log 사용 금지', 'review-2');
      memory.recordConvention('no-console', 'console.log 사용 금지', 'review-3');
      const data = memory.getData();
      expect(data.conventions.length).toBe(1);
      expect(data.conventions[0].occurrences).toBe(3);
      expect(data.conventions[0].confidence).toBe(0.7);
    });
  });

  describe('getBestFixStrategy', () => {
    it('과거 성공 전략을 반환한다', () => {
      memory.recordIssue('unused import', 'warning');
      memory.recordFix('unused import', 'remove-unused-import', true, 1);
      const best = memory.getBestFixStrategy('unused import');
      expect(best).toBe('remove-unused-import');
    });

    it('기록 없으면 null 반환', () => {
      const best = memory.getBestFixStrategy('unknown issue');
      expect(best).toBeNull();
    });
  });

  describe('getRecurringPatterns', () => {
    it('발생 빈도순으로 반환한다', () => {
      memory.recordIssue('issue A', 'warning');
      memory.recordIssue('issue B', 'error');
      memory.recordIssue('issue B', 'error');
      memory.recordIssue('issue B', 'error');
      memory.recordIssue('issue A', 'warning');
      const patterns = memory.getRecurringPatterns(2);
      expect(patterns.length).toBe(2);
      expect(patterns[0].occurrences).toBe(3);
    });
  });

  describe('getConventions', () => {
    it('최소 신뢰도 이상만 반환한다', () => {
      memory.recordConvention('rule-a', 'low', 'src');
      // rule-a: confidence 0.5
      memory.recordConvention('rule-b', 'high', 'src');
      memory.recordConvention('rule-b', 'high', 'src');
      memory.recordConvention('rule-b', 'high', 'src');
      memory.recordConvention('rule-b', 'high', 'src');
      memory.recordConvention('rule-b', 'high', 'src');
      memory.recordConvention('rule-b', 'high', 'src');
      // rule-b: confidence 0.5 + 0.1*5 = 1.0

      const highConfidence = memory.getConventions(0.8);
      expect(highConfidence.length).toBe(1);
      expect(highConfidence[0].rule).toBe('rule-b');
    });
  });

  describe('updateProjectProfile', () => {
    it('프로젝트 프로필을 생성한다', () => {
      memory.updateProjectProfile('test-project', ['TypeScript', 'React'], 85);
      const data = memory.getData();
      expect(data.projectProfile).not.toBeNull();
      expect(data.projectProfile!.name).toBe('test-project');
      expect(data.projectProfile!.avgQualityScore).toBe(85);
      expect(data.projectProfile!.totalSessions).toBe(1);
    });

    it('기존 프로필의 평균 품질을 갱신한다', () => {
      memory.updateProjectProfile('test-project', ['TypeScript'], 80);
      memory.updateProjectProfile('test-project', ['TypeScript'], 90);
      const data = memory.getData();
      expect(data.projectProfile!.totalSessions).toBe(2);
      expect(data.projectProfile!.avgQualityScore).toBe(85);
    });
  });

  describe('generateReport', () => {
    it('빈 상태에서도 보고서를 생성한다', () => {
      const report = memory.generateReport();
      expect(report.totalPatterns).toBe(0);
      expect(report.totalFixes).toBe(0);
      expect(report.totalConventions).toBe(0);
    });

    it('데이터가 있으면 요약 보고서를 생성한다', () => {
      memory.recordIssue('unused import detected', 'error', 'src/a.ts');
      memory.recordIssue('empty catch block found', 'warning', 'src/b.ts');
      memory.recordFix('unused import detected', 'auto-fix', true, 1);
      memory.recordConvention('no-any', 'any 타입 금지', 'review');
      memory.updateProjectProfile('proj', ['TS'], 90);

      const report = memory.generateReport();
      expect(report.totalPatterns).toBe(2);
      expect(report.totalFixes).toBe(1);
      expect(report.totalConventions).toBe(1);
      expect(report.avgQuality).toBe(90);
      expect(report.sessions).toBe(1);
      expect(report.bestStrategies.length).toBe(1);
      expect(report.bestStrategies[0].strategy).toBe('auto-fix');
    });
  });

  describe('save/load', () => {
    it('save가 JSON을 파일에 쓴다', () => {
      memory.recordIssue('test issue', 'info');
      memory.save();
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = mockFs.writeFileSync.mock.calls[0] as [string, string, string];
      expect(filePath).toContain('learning-memory.json');
      const parsed = JSON.parse(content);
      expect(parsed.issuePatterns.length).toBe(1);
    });

    it('기존 파일이 있으면 load한다', () => {
      const savedData = {
        version: '1.0.0',
        issuePatterns: [{ signature: 'existing', category: 'error', occurrences: 5, filePatterns: [], successfulFixes: [], failedFixes: [], firstSeen: '', lastSeen: '' }],
        conventions: [],
        fixRecords: [],
        projectProfile: null,
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedData));

      const loaded = new LearningMemory('/test/project');
      const data = loaded.getData();
      expect(data.issuePatterns.length).toBe(1);
      expect(data.issuePatterns[0].signature).toBe('existing');
      expect(data.issuePatterns[0].occurrences).toBe(5);
    });

    it('파일이 손상되었으면 빈 데이터로 시작한다', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json{{{');

      const loaded = new LearningMemory('/test/project');
      const data = loaded.getData();
      expect(data.issuePatterns.length).toBe(0);
    });
  });
});
