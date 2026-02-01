/**
 * Antigravity Web Dashboard - Express Server
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { CodeReviewAgent } from '../agent';
import { formatReportAsText } from '../report-generator';
import { loadConfig } from '../utils/config-loader';
import { loadHistory, analyzeTrend, formatTrendReport } from '../utils/review-history';
import { computeQualityScore } from '../utils/quality-scorer';
import { Orchestrator } from '../orchestrator';
import { TaskPhase } from '../orchestrator/types';
import {
  reviewBodySchema, orchestrateBodySchema,
  historyQuerySchema, pathQuerySchema,
  validateBody,
} from './validators';

/**
 * 사용자 제공 프로젝트 경로를 검증합니다.
 * Path Traversal 공격을 방지합니다.
 */
function validateProjectPath(userPath: string | undefined, fallback: string): string {
  if (!userPath || typeof userPath !== 'string') return fallback;

  const resolved = path.resolve(userPath);

  // 상대경로 구성요소 방지
  if (userPath.includes('..')) {
    throw new Error('Invalid path: relative path components not allowed');
  }

  // 절대경로만 허용
  if (!path.isAbsolute(resolved)) {
    throw new Error('Invalid path: must be absolute');
  }

  // 민감한 시스템 디렉토리 차단
  const forbidden = ['/etc', '/proc', '/sys', '/dev', '/var/run', '/root/.ssh', '/boot'];
  for (const fp of forbidden) {
    if (resolved === fp || resolved.startsWith(fp + '/')) {
      throw new Error('Invalid path: system directory access denied');
    }
  }

  return resolved;
}

export function createServer(defaultProjectPath?: string): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  // ─── 프로젝트 정보 ───
  app.get('/api/project', (req, res) => {
    try {
      const parsed = validateBody(pathQuerySchema, req.query);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const { config } = loadConfig(projectPath);
      const pkgPath = path.join(projectPath, 'package.json');
      let pkg: Record<string, unknown> = {};
      if (fs.existsSync(pkgPath)) {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      }
      res.json({
        name: pkg.name || path.basename(projectPath),
        path: projectPath,
        config: config || {},
        version: pkg.version || 'unknown',
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 코드리뷰 실행 ───
  app.post('/api/review', (req, res) => {
    try {
      const parsed = validateBody(reviewBodySchema, req.body);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const stages = parsed.data.stages;
      const autoFix = parsed.data.autoFix;
      const { config: fileConfig } = loadConfig(projectPath);
      const agent = new CodeReviewAgent({
        ...(fileConfig ?? {}),
        projectPath,
        stages,
        verbose: false,
        autoFix,
        failFast: false,
      });

      const report = agent.run();
      const text = formatReportAsText(report);

      res.json({
        passed: report.passed,
        duration: report.duration,
        text,
        stages: report.stages.map((s) => ({
          stage: s.stage,
          status: s.status,
          issueCount: s.issues.length,
          issues: s.issues.slice(0, 20),
          duration: s.duration,
        })),
        fixReport: report.fixReport || null,
        insights: report.insights || [],
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 오케스트레이션 실행 ───
  app.post('/api/orchestrate', (req, res) => {
    try {
      const parsed = validateBody(orchestrateBodySchema, req.body);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const phases: TaskPhase[] = parsed.data.phases;
      const failFast = parsed.data.failFast;
      const orchestrator = Orchestrator.quickStart(projectPath);
      const config = orchestrator.getConfig();
      config.pipeline.phases = phases;
      config.pipeline.failFast = failFast;
      config.pipeline.humanGates = [];

      const state = orchestrator.run();

      res.json({
        status: state.status,
        phases: state.config.phases,
        tasks: state.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          agent: t.assignedAgent,
          retryCount: t.retryCount,
          result: t.result ? {
            success: t.result.success,
            duration: t.result.duration,
            issueCount: t.result.issues.length,
            issues: t.result.issues.slice(0, 10),
            artifacts: t.result.artifacts,
          } : null,
        })),
        agents: state.agents,
        logs: state.logs,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 히스토리 ───
  app.get('/api/history', (req, res) => {
    try {
      const parsed = validateBody(historyQuerySchema, req.query);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const count = parsed.data.count;
      const history = loadHistory(projectPath);
      const entries = history.entries.slice(-count);
      res.json({ total: history.entries.length, entries });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 트렌드 ───
  app.get('/api/trend', (req, res) => {
    try {
      const parsed = validateBody(pathQuerySchema, req.query);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const trend = analyzeTrend(projectPath);
      const text = formatTrendReport(trend);
      res.json({ ...trend, text });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 품질 점수 ───
  app.get('/api/quality-score', (req, res) => {
    try {
      const parsed = validateBody(pathQuerySchema, req.query);
      if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const projectPath = validateProjectPath(parsed.data.path, defaultProjectPath || process.cwd());
      const result = computeQualityScore(projectPath);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── 팀 정보 ───
  app.get('/api/team', (_req, res) => {
    res.json({
      agents: [
        { id: 1, name: 'Planner Agent', role: 'planner', description: '시스템 아키텍처 설계, 태스크 분해', icon: '📋' },
        { id: 2, name: 'Coder Agent', role: 'coder', description: 'AI 기반 코드 생성, 파일 작성', icon: '💻' },
        { id: 3, name: 'Reviewer Agent', role: 'reviewer', description: '컴파일/린트/테스트 자동 코드리뷰', icon: '🔍' },
        { id: 4, name: 'Tester Agent', role: 'tester', description: '단위/통합/E2E 테스트 실행', icon: '🧪' },
        { id: 5, name: 'Security Agent', role: 'security', description: '보안 감사, 취약점 분석, 시크릿 스캔', icon: '🛡️' },
        { id: 6, name: 'Browser Agent', role: 'browser', description: '스크린샷 기반 UI 검증, 접근성 검사', icon: '🌐' },
        { id: 7, name: 'Deployer Agent', role: 'deployer', description: '빌드, Docker, Vercel, 클라우드 배포', icon: '🚀' },
      ],
      pipeline: ['Plan', 'Code', 'Review', 'Test', 'Security', 'Browser', 'Deploy'],
    });
  });

  // SPA fallback
  app.use((_req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  });

  return app;
}

export function startDashboard(port: number, projectPath?: string): void {
  const app = createServer(projectPath);
  app.listen(port, () => {
  });
}
