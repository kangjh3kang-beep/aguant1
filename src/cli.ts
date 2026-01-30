#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { CodeReviewAgent } from './agent';
import { formatReportAsText, formatReportAsJson } from './report-generator';
import { ReviewStage } from './types';
import { loadConfig } from './utils/config-loader';
import { runProcess } from './utils/process-runner';

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

// ─── update ────────────────────────────────────────────────
program
  .command('update')
  .description('에이전트를 최신 버전으로 업데이트합니다')
  .action(() => {
    console.log('\n[UPDATE] Antigravity Code Review Agent 업데이트 시작...\n');

    const agentRoot = path.resolve(__dirname, '..');

    console.log('  [1/3] 최신 코드 가져오는 중...');
    const pullResult = runProcess('git pull origin main', agentRoot, 60_000);
    if (pullResult.exitCode !== 0) {
      console.log('  Git pull 실패. 수동 업데이트:');
      console.log(`    cd ${agentRoot}`);
      console.log('    git pull origin main');
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
