#!/usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import path from 'path';

// .env 파일에서 환경변수 자동 로드 (API 키 등)
dotenv.config();
import { CodeReviewAgent } from './agent';
import { formatReportAsText, formatReportAsJson } from './report-generator';
import { ReviewStage } from './types';
import { loadConfig } from './utils/config-loader';
import { runProcess } from './utils/process-runner';
import { loadHistory, analyzeTrend, formatTrendReport } from './utils/review-history';
import { Orchestrator } from './orchestrator';
import { AutonomousLoop } from './orchestrator/autonomous-loop';
import { TaskPhase } from './orchestrator/types';

const program = new Command();

program
  .name('ag-review')
  .description('Antigravity Code Review Agent - 자동 코드리뷰, 검증, 수정 에이전트')
  .version('1.1.0');

// ─── review ────────────────────────────────────────────────
program
  .command('review')
  .description('코드리뷰를 수행합니다 (컴파일 -> 린트 -> 테스트)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('-c, --compile', '컴파일 검사 실행', false)
  .option('-l, --lint', '린트 검사 실행', false)
  .option('-t, --test', '테스트 실행', false)
  .option('--compile-cmd <cmd>', '커스텀 컴파일 커맨드')
  .option('--lint-cmd <cmd>', '커스텀 린트 커맨드')
  .option('--test-cmd <cmd>', '커스텀 테스트 커맨드')
  .option('--fail-fast', '첫 실패 시 중단', false)
  .option('--json', 'JSON 형식으로 출력', false)
  .option('--auto-fix', '자동 수정 활성화', false)
  .option('--diff-only', '변경된 파일만 분석', false)
  .option('--base-branch <branch>', 'diff 비교 기준 브랜치')
  .option('-v, --verbose', '상세 출력', false)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);

      const { config: fileConfig, errors } = loadConfig(projectPath);
      if (errors.length > 0) {
        console.error('Config validation errors:');
        for (const err of errors) {
          console.error(`  - ${err.field}: ${err.message}`);
        }
        process.exit(2);
      }

      const hasSpecific = options.compile || options.lint || options.test;
      const stages: ReviewStage[] = hasSpecific
        ? [
            ...(options.compile ? ['compile' as ReviewStage] : []),
            ...(options.lint ? ['lint' as ReviewStage] : []),
            ...(options.test ? ['test' as ReviewStage] : []),
          ]
        : (fileConfig?.stages ?? ['compile', 'lint', 'test']);

      const agent = new CodeReviewAgent({
        ...(fileConfig ?? {}),
        projectPath,
        stages,
        compileCommand: options.compileCmd ?? fileConfig?.compileCommand,
        lintCommand: options.lintCmd ?? fileConfig?.lintCommand,
        testCommand: options.testCmd ?? fileConfig?.testCommand,
        failFast: options.failFast || fileConfig?.failFast,
        verbose: !options.json && (options.verbose || !hasSpecific),
        autoFix: options.autoFix,
        diffOnly: options.diffOnly,
        baseBranch: options.baseBranch,
      });

      const report = agent.run();

      if (options.json) {
        console.log(formatReportAsJson(report));
      } else if (!options.verbose && hasSpecific) {
        console.log(formatReportAsText(report));
      }

      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── check ─────────────────────────────────────────────────
program
  .command('check')
  .description('빠른 검증 (컴파일 + 린트만)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--fail-fast', '첫 실패 시 중단', true)
  .option('-v, --verbose', '상세 출력', true)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const { config: fileConfig } = loadConfig(projectPath);

      const agent = new CodeReviewAgent({
        ...(fileConfig ?? {}),
        projectPath,
        stages: ['compile', 'lint'],
        failFast: options.failFast,
        verbose: options.verbose,
      });

      const report = agent.run();
      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── fix ───────────────────────────────────────────────────
program
  .command('fix')
  .description('자동 수정 실행 (린트 --fix + 스냅샷 업데이트)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('-v, --verbose', '상세 출력', true)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const { config: fileConfig } = loadConfig(projectPath);

      const agent = new CodeReviewAgent({
        ...(fileConfig ?? {}),
        projectPath,
        stages: ['compile', 'lint', 'test'],
        verbose: options.verbose,
        autoFix: true,
      });

      const report = agent.run();
      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── preview ───────────────────────────────────────────────
program
  .command('preview')
  .description('변경된 파일만 검증 (Git diff 기반)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--base-branch <branch>', '비교 기준 브랜치', 'main')
  .option('-v, --verbose', '상세 출력', true)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const { config: fileConfig } = loadConfig(projectPath);

      const agent = new CodeReviewAgent({
        ...(fileConfig ?? {}),
        projectPath,
        stages: ['compile', 'lint', 'test'],
        verbose: options.verbose,
        diffOnly: true,
        baseBranch: options.baseBranch,
      });

      const report = agent.run();
      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── history ──────────────────────────────────────────────
program
  .command('history')
  .description('리뷰 히스토리를 조회합니다')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('-n, --last <count>', '최근 N개 항목만 표시', '10')
  .option('--json', 'JSON 형식으로 출력', false)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const history = loadHistory(projectPath);
      const count = parseInt(options.last, 10) || 10;
      const entries = history.entries.slice(-count);

      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      if (entries.length === 0) {
        console.log('\n  No review history found.');
        console.log('  Run "ag-review review" to start recording.\n');
        return;
      }

      console.log('\n========================================');
      console.log('  Antigravity Review History');
      console.log(`  Project: ${projectPath}`);
      console.log(`  Showing last ${entries.length} of ${history.entries.length} runs`);
      console.log('========================================\n');

      for (const entry of entries) {
        const status = entry.passed ? 'PASS' : 'FAIL';
        const branch = entry.gitBranch ? ` [${entry.gitBranch}]` : '';
        const date = new Date(entry.timestamp).toLocaleString();
        console.log(`  ${date}${branch}  ${status}  errors:${entry.errorCount} warnings:${entry.warningCount}  (${entry.duration}ms)`);
        for (const stage of entry.stages) {
          console.log(`    [${stage.stage.toUpperCase()}] ${stage.status.toUpperCase()} - ${stage.issueCount} issue(s) (${stage.duration}ms)`);
        }
        if (entry.fixReport) {
          console.log(`    [FIX] lint:${entry.fixReport.lintFixedCount} snapshot:${entry.fixReport.snapshotsUpdated} suggestions:${entry.fixReport.suggestionCount}`);
        }
        console.log('');
      }
    } catch (err: unknown) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── trend ────────────────────────────────────────────────
program
  .command('trend')
  .description('리뷰 트렌드를 분석합니다 (개선/악화 추적)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--json', 'JSON 형식으로 출력', false)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const trend = analyzeTrend(projectPath);

      if (options.json) {
        console.log(JSON.stringify(trend, null, 2));
        return;
      }

      if (trend.totalRuns === 0) {
        console.log('\n  No review history found.');
        console.log('  Run "ag-review review" to start recording.\n');
        return;
      }

      console.log('\n' + formatTrendReport(trend));
    } catch (err: unknown) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── orchestrate ──────────────────────────────────────────
program
  .command('orchestrate')
  .description('전체 파이프라인 오케스트레이션 실행 (기획→개발→리뷰→테스트→보안→브라우저→배포)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--phases <phases>', '실행할 단계 (쉼표 구분: plan,code,review,test,security,browser,deploy)')
  .option('--no-parallel', '병렬 실행 비활성화')
  .option('--fail-fast', '첫 실패 시 중단', false)
  .option('--max-iterations <n>', '최대 반복 횟수', '3')
  .option('--human-gates <phases>', '인간 승인 필요 단계 (쉼표 구분)')
  .option('--json', 'JSON 형식으로 출력', false)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const allPhases: TaskPhase[] = ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy'];
      const phases: TaskPhase[] = options.phases
        ? options.phases.split(',').map((p: string) => p.trim() as TaskPhase).filter((p: TaskPhase) => allPhases.includes(p))
        : allPhases;
      const humanGates: TaskPhase[] = options.humanGates
        ? options.humanGates.split(',').map((p: string) => p.trim() as TaskPhase)
        : [];

      const orchestrator = Orchestrator.quickStart(projectPath);

      // 설정 오버라이드
      const config = orchestrator.getConfig();
      config.pipeline.phases = phases;
      config.pipeline.failFast = options.failFast;
      config.pipeline.maxIterations = parseInt(options.maxIterations, 10) || 3;
      config.pipeline.humanGates = humanGates;
      config.pipeline.parallel = options.parallel !== false;

      const state = orchestrator.run();

      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
      }

      process.exit(state.status === 'completed' ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── autonomous (자율 반복 루프) ─────────────────────────
program
  .command('autonomous')
  .alias('auto')
  .description('자율 반복 루프 실행 (코딩→리뷰→수정→테스트→보안 자동 반복, 프로덕션까지)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--max-cycles <n>', '최대 자기수정 사이클 수', '5')
  .option('--phases <phases>', '실행할 단계 (쉼표 구분)')
  .option('--no-pause', '인간 개입 필요시에도 중단하지 않음')
  .option('--json', 'JSON 형식으로 출력', false)
  .action((options) => {
    try {
      const projectPath = path.resolve(options.path);
      const allPhases: TaskPhase[] = ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy'];
      const phases: TaskPhase[] = options.phases
        ? options.phases.split(',').map((p: string) => p.trim() as TaskPhase).filter((p: TaskPhase) => allPhases.includes(p))
        : allPhases;

      // 프로젝트 자동 감지
      const orchestrator = Orchestrator.quickStart(projectPath);
      const config = orchestrator.getConfig();

      const loop = new AutonomousLoop(
        config.project,
        { ...config.pipeline, phases },
        {
          maxHealingCycles: parseInt(options.maxCycles, 10) || 5,
          pauseOnHumanNeeded: options.pause !== false,
        },
      );

      const state = loop.run();

      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
      }

      process.exit(state.status === 'completed' ? 0 : 1);
    } catch (err: unknown) {
      console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  });

// ─── team ─────────────────────────────────────────────────
program
  .command('team')
  .description('에이전트 팀 상태를 표시합니다')
  .action(() => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   ANTIGRAVITY AUTONOMOUS CODING TEAM         ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  [1] Planner Agent      - 시스템 아키텍처 설계, 태스크 분해');
    console.log('  [2] Coder Agent        - AI 기반 코드 생성, 파일 작성');
    console.log('  [3] Reviewer Agent     - 컴파일/린트/테스트 자동 코드리뷰');
    console.log('  [4] Tester Agent       - 단위/통합/E2E 테스트 실행');
    console.log('  [5] Security Agent     - 보안 감사, 취약점 분석, 시크릿 스캔');
    console.log('  [6] Browser Agent      - 스크린샷 기반 UI 검증, 접근성 검사');
    console.log('  [7] Deployer Agent     - 빌드, Docker, Vercel, 클라우드 배포');
    console.log('');
    console.log('  Pipeline: Plan → Code → Review → Test → Security → Browser → Deploy');
    console.log('');
    console.log('  Usage:');
    console.log('    ag-review orchestrate              전체 파이프라인 실행');
    console.log('    ag-review orchestrate --phases review,test,security  특정 단계만 실행');
    console.log('    ag-review orchestrate --fail-fast   첫 실패 시 중단');
    console.log('');
  });

// ─── dashboard ───────────────────────────────────────────
program
  .command('dashboard')
  .description('웹 대시보드를 실행합니다 (브라우저에서 사용)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--port <port>', '포트 번호', '3000')
  .action((options) => {
    const projectPath = path.resolve(options.path);
    const port = parseInt(options.port, 10) || 3000;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { startDashboard } = require('./web/server');
    startDashboard(port, projectPath);
  });

// ─── update ────────────────────────────────────────────────
program
  .command('update')
  .description('에이전트를 최신 버전으로 업데이트합니다')
  .action(() => {
    console.log('\n[UPDATE] Antigravity Code Review Agent 업데이트 시작...\n');

    const agentRoot = path.resolve(__dirname, '..');

    console.log('  [1/3] 최신 코드 가져오는 중...');
    // 현재 브랜치를 자동 감지
    const branchResult = runProcess('git rev-parse --abbrev-ref HEAD', agentRoot, 10_000);
    const currentBranch = branchResult.exitCode === 0
      ? branchResult.stdout.trim()
      : 'main';
    console.log(`  현재 브랜치: ${currentBranch}`);
    const pullResult = runProcess(`git pull origin ${currentBranch}`, agentRoot, 60_000);
    if (pullResult.exitCode !== 0) {
      console.log('  Git pull 실패. 수동 업데이트:');
      console.log(`    cd ${agentRoot}`);
      console.log(`    git pull origin ${currentBranch}`);
      console.log('    npm install && npm run build && npm link');
      process.exit(1);
    }
    console.log('  코드 업데이트 완료');

    console.log('  [2/3] 의존성 업데이트 중...');
    const installResult = runProcess('npm install', agentRoot, 120_000);
    if (installResult.exitCode !== 0) {
      console.error('  npm install 실패');
      process.exit(1);
    }
    console.log('  의존성 업데이트 완료');

    console.log('  [3/3] 빌드 중...');
    const buildResult = runProcess('npm run build', agentRoot, 60_000);
    if (buildResult.exitCode !== 0) {
      console.error('  빌드 실패');
      process.exit(1);
    }

    console.log('\n  업데이트가 완료되었습니다!\n');
  });

program.parse(process.argv);
