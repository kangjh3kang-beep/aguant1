#!/usr/bin/env node
import dotenv from 'dotenv';
import { Command } from 'commander';
import path from 'path';
// .env 파일에서 환경변수 자동 로드 (API 키 등)
dotenv.config();
import { CodeReviewAgent } from './agent';
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
    .option('-r, --runtime', '런타임 헬스체크 실행', false)
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
        const hasSpecific = options.compile || options.lint || options.test || options.runtime;
        const stages: ReviewStage[] = hasSpecific
            ? [
                ...(options.compile ? ['compile' as ReviewStage] : []),
                ...(options.lint ? ['lint' as ReviewStage] : []),
                ...(options.test ? ['test' as ReviewStage] : []),
                ...(options.runtime ? ['runtime' as ReviewStage] : []),
            ]
            : (fileConfig?.stages ?? ['compile', 'lint', 'test', 'runtime']);
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
            console.log(JSON.stringify({ json: true, passed: report.passed, duration: report.duration, stages: report.stages }));
        }
        else if (!options.verbose && hasSpecific) {
            console.log(`Review ${report.passed ? 'PASSED' : 'FAILED'} (${report.duration}ms)`);
        }
        process.exit(report.passed ? 0 : 1);
    }
    catch (err: unknown) {
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
    }
    catch (err: unknown) {
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
    }
    catch (err: unknown) {
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
    }
    catch (err: unknown) {
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
            console.log(JSON.stringify(entries));
            return;
        }
        if (entries.length === 0) {
            console.log('No review history found.');
            return;
        }
        console.log(`\n  Review History (${entries.length} entries)\n`);
        for (const entry of entries) {
            const status = entry.passed ? 'PASS' : 'FAIL';
            console.log(`  ${entry.timestamp}  ${status}  errors:${entry.errorCount} warnings:${entry.warningCount} (${entry.duration}ms)`);
            for (const stage of entry.stages) {
                console.log(`    ${stage.stage}: ${stage.status} (${stage.issueCount} issues, ${stage.duration}ms)`);
            }
            if (entry.fixReport) {
                console.log('    [Auto-fix applied]');
            }
        }
    }
    catch (err: unknown) {
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
            console.log(JSON.stringify(trend));
            return;
        }
        if (trend.totalRuns === 0) {
            console.log('No review history found for trend analysis.');
            return;
        }
        const trendText = formatTrendReport(trend);
        console.log(trendText);
    }
    catch (err: unknown) {
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
            // no-op
        }
        process.exit(state.status === 'completed' ? 0 : 1);
    }
    catch (err: unknown) {
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
        const loop = new AutonomousLoop(config.project, { ...config.pipeline, phases }, {
            maxHealingCycles: parseInt(options.maxCycles, 10) || 5,
            pauseOnHumanNeeded: options.pause !== false,
        });
        const state = loop.run();
        if (options.json) {
            // no-op
        }
        process.exit(state.status === 'completed' ? 0 : 1);
    }
    catch (err: unknown) {
        console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(2);
    }
});
// ─── team ─────────────────────────────────────────────────
program
    .command('team')
    .description('에이전트 팀 상태를 표시합니다')
    .action(() => {
    console.log('\n  ═══ ANTIGRAVITY Agent Team ═══\n');
    const agents = [
        { name: 'Planner Agent', role: 'planner', desc: '시스템 아키텍처 설계, 태스크 분해' },
        { name: 'Coder Agent', role: 'coder', desc: 'AI 기반 코드 생성, 파일 작성' },
        { name: 'Reviewer Agent', role: 'reviewer', desc: '컴파일/린트/테스트 자동 코드리뷰' },
        { name: 'Tester Agent', role: 'tester', desc: '단위/통합/E2E 테스트 실행' },
        { name: 'Security Agent', role: 'security', desc: '보안 감사, 취약점 분석' },
        { name: 'Browser Agent', role: 'browser', desc: 'UI 검증, 접근성 검사' },
        { name: 'Deployer Agent', role: 'deployer', desc: '빌드, Docker, 클라우드 배포' },
    ];
    for (const agent of agents) {
        console.log(`  ${agent.name} (${agent.role}): ${agent.desc}`);
    }
    console.log('\n  Pipeline: Plan → Code → Review → Test → Security → Browser → Deploy\n');
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
    const agentRoot = path.resolve(__dirname, '..');
    const stashResult = runProcess('git stash --include-untracked', agentRoot, 10000, true);
    const hasStash = stashResult.exitCode === 0 && !stashResult.stdout.includes('No local changes');
    if (hasStash) {
        console.log('  로컬 변경사항 임시 저장 (git stash)');
    }
    else {
        console.log('  로컬 변경사항 없음');
    }
    // 현재 브랜치를 자동 감지
    const branchResult = runProcess('git rev-parse --abbrev-ref HEAD', agentRoot, 10000, true);
    const currentBranch = branchResult.exitCode === 0
        ? branchResult.stdout.trim()
        : 'main';
    // 보안: 브랜치명 검증 (커맨드 인젝션 방지)
    const safeBranch = /^[a-zA-Z0-9._\-/]+$/.test(currentBranch) ? currentBranch : 'main';
    const pullResult = runProcess(`git pull origin ${safeBranch}`, agentRoot, 60000, true);
    if (pullResult.exitCode !== 0) {
        console.log('  Git pull 실패');
        if (hasStash) {
            runProcess('git stash pop', agentRoot, 10000, true);
        }
        process.exit(1);
    }
    if (hasStash) {
        runProcess('git stash pop', agentRoot, 10000, true);
    }
    const installResult = runProcess('npm install', agentRoot, 120000, true);
    if (installResult.exitCode !== 0) {
        console.error('  npm install 실패');
        process.exit(1);
    }
    const buildResult = runProcess('npm run build', agentRoot, 60000, true);
    if (buildResult.exitCode !== 0) {
        console.error('  빌드 실패');
        process.exit(1);
    }
    console.log('  ✓ 업데이트가 완료되었습니다!');
});
program.parse(process.argv);
