# Antigravity Code Review Agent

자동 코드리뷰 에이전트 - 컴파일, 린트, 테스트를 자동으로 수행하여 완벽한 코드 검증을 제공합니다.

```
PR / Push
   │
   ▼
┌──────────────────────────────────────────┐
│  Antigravity Code Review Agent           │
│                                          │
│  [Stage 1] Compile ──► TypeScript 검증   │
│       │                                  │
│       ▼                                  │
│  [Stage 2] Lint    ──► ESLint 분석       │
│       │                                  │
│       ▼                                  │
│  [Stage 3] Test    ──► Jest 테스트       │
│       │                                  │
│       ▼                                  │
│  ✔ 통합 리포트 생성                       │
└──────────────────────────────────────────┘
```

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [에이전트 설치 (원클릭)](#2-에이전트-설치-원클릭)
3. [내 프로젝트에 적용하기](#3-내-프로젝트에-적용하기)
4. [사용법](#4-사용법)
5. [GitHub Actions로 자동화하기](#5-github-actions로-자동화하기)
6. [설정 커스터마이징](#6-설정-커스터마이징)
7. [문제 해결](#7-문제-해결)

---

## 1. 사전 준비

시작하기 전에 아래 2가지만 설치되어 있으면 됩니다.

### Node.js 설치

- https://nodejs.org/ko 접속
- **LTS (장기 지원 버전)** 다운로드 및 설치
- 설치 확인:

```bash
node -v    # v18.x.x 이상이면 OK
npm -v     # 9.x.x 이상이면 OK
```

### Git 설치

- https://git-scm.com 접속, 다운로드 및 설치
- 설치 확인:

```bash
git --version    # git version 2.x.x 이면 OK
```

---

## 2. 에이전트 설치 (원클릭)

### 방법 A: 자동 설치 (추천)

```bash
# 1. 리포지토리 클론
git clone https://github.com/kangjh3kang-beep/aguant1.git

# 2. 디렉토리 이동
cd aguant1

# 3. 원클릭 설치 실행
bash setup.sh
```

이것만 하면 `ag-review` 명령어가 컴퓨터 전체에서 사용 가능합니다.

### 방법 B: 수동 설치

```bash
git clone https://github.com/kangjh3kang-beep/aguant1.git
cd aguant1
npm install
npm run build
npm link
```

### 설치 확인

```bash
ag-review --version
# 1.0.0 이 출력되면 설치 성공
```

---

## 3. 내 프로젝트에 적용하기

### STEP 1: 프로젝트 디렉토리로 이동

```bash
cd /내/프로젝트/경로

# 예시:
cd ~/Documents/my-web-app
```

### STEP 2: 설정 파일 자동 생성

```bash
ag-review-init
```

실행하면 프로젝트 루트에 `ag-review.config.json` 파일이 생성됩니다.

### STEP 3: 코드리뷰 실행

```bash
ag-review review
```

끝입니다. 3개 명령어면 어떤 프로젝트든 적용 완료입니다.

---

## 4. 사용법

### 전체 검증 (컴파일 + 린트 + 테스트)

```bash
ag-review review
```

출력 예시:
```
========================================
  Antigravity Code Review Agent
========================================
  Project: /Users/me/my-project
  Time:    2026-01-30T12:00:00.000Z
========================================

[COMPILE] PASS (1200ms)
[LINT]    PASS (800ms)
[TEST]    PASS (3500ms)

----------------------------------------
  Review Summary
----------------------------------------
  Result: ALL CHECKS PASSED
  Errors:   0
  Warnings: 0
  Duration: 5500ms
----------------------------------------
```

### 개별 스테이지만 실행

```bash
ag-review review --compile          # 컴파일만
ag-review review --lint             # 린트만
ag-review review --test             # 테스트만
ag-review review --compile --lint   # 컴파일 + 린트
```

### 빠른 검증 (테스트 제외)

```bash
ag-review check
```

### JSON 리포트

```bash
ag-review review --json
ag-review review --json > report.json    # 파일로 저장
```

### Fail-Fast 모드

첫 번째 실패가 발생하면 즉시 중단합니다:

```bash
ag-review review --fail-fast
```

### 다른 프로젝트 경로 지정

```bash
ag-review review --path /other/project
```

---

## 5. GitHub Actions로 자동화하기

PR이나 push가 발생할 때마다 자동으로 코드리뷰가 실행되게 하려면:

### STEP 1: 워크플로우 파일 복사

```bash
# 내 프로젝트 디렉토리에서 실행
mkdir -p .github/workflows

# 아래 내용을 .github/workflows/code-review.yml 로 저장
```

### STEP 2: 워크플로우 내용

```yaml
name: Antigravity Code Review

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: "[1/3] Compile Check"
        run: npx tsc --noEmit

      - name: "[2/3] Lint Check"
        run: npx eslint 'src/**/*.ts'

      - name: "[3/3] Test"
        run: npx jest --coverage
```

### STEP 3: Git에 push

```bash
git add .github/workflows/code-review.yml
git commit -m "ci: add antigravity code review workflow"
git push
```

이제 PR을 올리면 자동으로 3단계 검증이 실행됩니다.

---

## 6. 설정 커스터마이징

프로젝트 루트의 `ag-review.config.json`을 편집합니다:

```json
{
  "projectPath": ".",
  "stages": ["compile", "lint", "test"],
  "compileCommand": "npx tsc --noEmit",
  "lintCommand": "npx eslint 'src/**/*.ts' --format json",
  "testCommand": "npx jest --json --no-coverage",
  "failFast": false,
  "verbose": true
}
```

### 자주 쓰는 설정 예시

**React 프로젝트:**
```json
{
  "compileCommand": "npx tsc --noEmit",
  "lintCommand": "npx eslint 'src/**/*.{ts,tsx}' --format json",
  "testCommand": "npx react-scripts test --watchAll=false --json"
}
```

**Next.js 프로젝트:**
```json
{
  "compileCommand": "npx next build --no-lint",
  "lintCommand": "npx next lint --format json",
  "testCommand": "npx jest --json --no-coverage"
}
```

**Python 프로젝트 (커스텀 커맨드):**
```json
{
  "stages": ["lint", "test"],
  "lintCommand": "python -m flake8 src/ --format json",
  "testCommand": "python -m pytest --tb=short -q"
}
```

---

## 7. 문제 해결

### `ag-review: command not found`

```bash
# npm 글로벌 경로 확인
npm config get prefix

# 해당 경로가 PATH에 있는지 확인, 없으면 추가:
# Mac/Linux:
export PATH="$(npm config get prefix)/bin:$PATH"

# 또는 재설치:
cd aguant1
npm link
```

### 권한 오류 (EACCES)

```bash
# Mac/Linux에서 sudo 사용
sudo npm link

# 또는 npm 글로벌 경로 변경 (권장)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="~/.npm-global/bin:$PATH"
```

### 컴파일/린트/테스트 커맨드가 프로젝트에 맞지 않을 때

`ag-review.config.json`에서 해당 커맨드를 프로젝트에 맞게 수정하세요. 예를 들어 eslint 대신 biome을 쓴다면:

```json
{
  "lintCommand": "npx biome check src/"
}
```

### 특정 스테이지를 건너뛰고 싶을 때

```json
{
  "stages": ["compile", "test"]
}
```

`stages` 배열에서 제외하면 해당 단계를 실행하지 않습니다.

---

## 프로젝트 구조

```
aguant1/
├── setup.sh                            # 원클릭 설치 스크립트
├── ag-review.config.json               # 기본 설정 파일
├── package.json
├── tsconfig.json
├── .github/workflows/code-review.yml   # CI 자동화
└── src/
    ├── index.ts                        # 라이브러리 진입점
    ├── cli.ts                          # CLI (ag-review 명령어)
    ├── init.ts                         # 초기화 (ag-review-init 명령어)
    ├── agent.ts                        # 에이전트 핵심 엔진
    ├── report-generator.ts             # 리포트 생성
    ├── types.ts                        # 타입 정의
    ├── analyzers/
    │   ├── compile-analyzer.ts         # 컴파일 분석기
    │   ├── lint-analyzer.ts            # 린트 분석기
    │   └── test-analyzer.ts            # 테스트 분석기
    └── utils/
        ├── logger.ts                   # 로거
        └── process-runner.ts           # 프로세스 실행기
```
