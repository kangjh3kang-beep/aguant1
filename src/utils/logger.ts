import chalk from 'chalk';
import { Severity, ReviewStage, StageStatus } from '../types';

const STAGE_ICONS: Record<ReviewStage, string> = {
  compile: '[COMPILE]',
  lint: '[LINT]',
  test: '[TEST]',
};

const STATUS_LABELS: Record<StageStatus, string> = {
  pass: chalk.green('PASS'),
  fail: chalk.red('FAIL'),
  skip: chalk.yellow('SKIP'),
  running: chalk.blue('RUNNING'),
};

const SEVERITY_LABELS: Record<Severity, string> = {
  error: chalk.red('ERROR'),
  warning: chalk.yellow('WARN'),
  info: chalk.cyan('INFO'),
};

export function logStageStart(stage: ReviewStage): void {
  console.log(`\n${chalk.bold(STAGE_ICONS[stage])} ${chalk.blue('Starting...')}`);
}

export function logStageResult(stage: ReviewStage, status: StageStatus, duration: number): void {
  const icon = STAGE_ICONS[stage];
  const label = STATUS_LABELS[status];
  console.log(`${chalk.bold(icon)} ${label} (${duration}ms)`);
}

export function logIssue(
  severity: Severity,
  file: string,
  line: number | undefined,
  message: string,
): void {
  const label = SEVERITY_LABELS[severity];
  const location = line ? `${file}:${line}` : file;
  console.log(`  ${label} ${chalk.gray(location)} ${message}`);
}

export function logHeader(projectPath: string): void {
  console.log(chalk.bold('\n========================================'));
  console.log(chalk.bold('  Antigravity Code Review Agent'));
  console.log(chalk.bold('========================================'));
  console.log(chalk.gray(`  Project: ${projectPath}`));
  console.log(chalk.gray(`  Time:    ${new Date().toISOString()}`));
  console.log(chalk.bold('========================================\n'));
}

export function logSummary(passed: boolean, errors: number, warnings: number, duration: number): void {
  console.log(chalk.bold('\n----------------------------------------'));
  console.log(chalk.bold('  Review Summary'));
  console.log(chalk.bold('----------------------------------------'));
  if (passed) {
    console.log(chalk.green.bold('  Result: ALL CHECKS PASSED'));
  } else {
    console.log(chalk.red.bold('  Result: REVIEW FAILED'));
  }
  console.log(`  Errors:   ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Duration: ${duration}ms`);
  console.log(chalk.bold('----------------------------------------\n'));
}
