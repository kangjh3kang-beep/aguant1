#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { CodeReviewAgent } from './agent';
import { formatReportAsText, formatReportAsJson } from './report-generator';
import { ReviewStage } from './types';

const program = new Command();

program
  .name('ag-review')
  .description('Antigravity Code Review Agent - 자동 코드리뷰 에이전트')
  .version('1.0.0');

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
  .option('-v, --verbose', '상세 출력', false)
  .action((options) => {
    const projectPath = path.resolve(options.path);

    // 개별 플래그가 하나도 없으면 전체 실행
    const hasSpecific = options.compile || options.lint || options.test;
    const stages: ReviewStage[] = hasSpecific
      ? [
          ...(options.compile ? ['compile' as ReviewStage] : []),
          ...(options.lint ? ['lint' as ReviewStage] : []),
          ...(options.test ? ['test' as ReviewStage] : []),
        ]
      : ['compile', 'lint', 'test'];

    const agent = new CodeReviewAgent({
      projectPath,
      stages,
      compileCommand: options.compileCmd,
      lintCommand: options.lintCmd,
      testCommand: options.testCmd,
      failFast: options.failFast,
      verbose: !options.json && (options.verbose || !hasSpecific),
    });

    const report = agent.run();

    if (options.json) {
      console.log(formatReportAsJson(report));
    } else if (!options.verbose && hasSpecific) {
      console.log(formatReportAsText(report));
    }

    process.exit(report.passed ? 0 : 1);
  });

program
  .command('check')
  .description('빠른 검증 (컴파일 + 린트만)')
  .option('-p, --path <path>', '프로젝트 경로', process.cwd())
  .option('--fail-fast', '첫 실패 시 중단', true)
  .option('-v, --verbose', '상세 출력', true)
  .action((options) => {
    const projectPath = path.resolve(options.path);

    const agent = new CodeReviewAgent({
      projectPath,
      stages: ['compile', 'lint'],
      failFast: options.failFast,
      verbose: options.verbose,
    });

    const report = agent.run();
    process.exit(report.passed ? 0 : 1);
  });

program.parse(process.argv);
