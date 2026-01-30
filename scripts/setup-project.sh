#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Antigravity Code Review Agent - 프로젝트 자동 설정 스크립트
#  사용법: bash ~/aguant1/scripts/setup-project.sh ~/My_Projects/MPK_Device
# ═══════════════════════════════════════════════════════════

PROJECT_PATH="${1:-.}"
PROJECT_PATH=$(cd "$PROJECT_PATH" 2>/dev/null && pwd || echo "$PROJECT_PATH")
PROJECT_NAME=$(basename "$PROJECT_PATH")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ANTIGRAVITY - 프로젝트 설정               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  프로젝트: $PROJECT_NAME"
echo "  경로:     $PROJECT_PATH"
echo ""

# ─── 프로젝트 폴더 확인 ───
if [ ! -d "$PROJECT_PATH" ]; then
  echo "  [오류] 프로젝트 폴더가 존재하지 않습니다: $PROJECT_PATH"
  echo "  폴더를 먼저 생성해주세요."
  exit 1
fi

cd "$PROJECT_PATH"

# ─── 프로젝트 타입 자동 감지 ───
echo "  [1/4] 프로젝트 타입 감지 중..."

HAS_PACKAGE_JSON=false
HAS_TYPESCRIPT=false
HAS_PYTHON=false
HAS_NEXTJS=false
HAS_REACT=false
HAS_ESLINT=false
HAS_JEST=false

[ -f "package.json" ] && HAS_PACKAGE_JSON=true
[ -f "tsconfig.json" ] && HAS_TYPESCRIPT=true
[ -f "requirements.txt" ] || [ -f "setup.py" ] || [ -f "pyproject.toml" ] && HAS_PYTHON=true

if [ "$HAS_PACKAGE_JSON" = true ]; then
  grep -q '"next"' package.json 2>/dev/null && HAS_NEXTJS=true
  grep -q '"react"' package.json 2>/dev/null && HAS_REACT=true
  grep -q '"eslint"' package.json 2>/dev/null && HAS_ESLINT=true
  grep -q '"jest"' package.json 2>/dev/null && HAS_JEST=true
  grep -q '"typescript"' package.json 2>/dev/null && HAS_TYPESCRIPT=true
fi

echo "    TypeScript: $HAS_TYPESCRIPT"
echo "    Python:     $HAS_PYTHON"
echo "    Next.js:    $HAS_NEXTJS"
echo "    React:      $HAS_REACT"
echo "    ESLint:     $HAS_ESLINT"
echo "    Jest:       $HAS_JEST"
echo ""

# ─── ag-review.config.json 생성 ───
echo "  [2/4] 설정 파일 생성 중..."

if [ -f "ag-review.config.json" ]; then
  echo "    ag-review.config.json 이미 존재 (건너뜀)"
else
  if [ "$HAS_NEXTJS" = true ]; then
    cat > ag-review.config.json << 'CONF'
{
  "stages": ["compile", "lint", "test"],
  "compileCommand": "npx next build --no-lint",
  "lintCommand": "npx next lint --format json",
  "testCommand": "npx jest --json --no-coverage",
  "failFast": false,
  "verbose": true
}
CONF
  elif [ "$HAS_TYPESCRIPT" = true ]; then
    cat > ag-review.config.json << 'CONF'
{
  "stages": ["compile", "lint", "test"],
  "compileCommand": "npx tsc --noEmit",
  "lintCommand": "npx eslint 'src/**/*.ts' --format json",
  "testCommand": "npx jest --json --no-coverage",
  "failFast": false,
  "verbose": true
}
CONF
  elif [ "$HAS_PYTHON" = true ]; then
    cat > ag-review.config.json << 'CONF'
{
  "stages": ["lint", "test"],
  "lintCommand": "python -m flake8 . --format json",
  "testCommand": "python -m pytest --tb=short -q",
  "failFast": false,
  "verbose": true
}
CONF
  elif [ "$HAS_PACKAGE_JSON" = true ]; then
    cat > ag-review.config.json << 'CONF'
{
  "stages": ["lint", "test"],
  "lintCommand": "npx eslint 'src/**/*.js' --format json",
  "testCommand": "npx jest --json --no-coverage",
  "failFast": false,
  "verbose": true
}
CONF
  else
    cat > ag-review.config.json << 'CONF'
{
  "stages": ["compile"],
  "compileCommand": "make build",
  "failFast": false,
  "verbose": true
}
CONF
  fi
  echo "    ag-review.config.json 생성 완료"
fi

# ─── .env 파일 생성 ───
echo "  [3/4] API 키 설정 파일 확인 중..."

if [ -f ".env" ]; then
  echo "    .env 파일 이미 존재 (건너뜀)"
else
  cat > .env << 'CONF'
# Antigravity AI 코드 생성용 API 키 (1개만 있으면 됨)
# 우선순위: Anthropic > OpenAI > Google
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
CONF
  echo "    .env 파일 생성 완료 (API 키를 입력해주세요)"
fi

# ─── .gitignore에 .env 추가 ───
if [ -f ".gitignore" ]; then
  grep -q "^\.env$" .gitignore || echo ".env" >> .gitignore
else
  echo ".env" > .gitignore
fi

# ─── 편의 스크립트 생성 ───
echo "  [4/4] 실행 스크립트 생성 중..."

cat > ag.sh << SCRIPT
#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  $PROJECT_NAME - Antigravity 실행 스크립트
#  사용법: bash ag.sh [명령]
# ═══════════════════════════════════════════════════════════

PROJECT="$PROJECT_PATH"

show_help() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   $PROJECT_NAME - Antigravity 명령어         ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  ── 기본 명령어 ──────────────────────────────"
  echo "  bash ag.sh review      코드리뷰 (컴파일+린트+테스트)"
  echo "  bash ag.sh fix         자동 수정"
  echo "  bash ag.sh check       빠른 검사 (컴파일+린트만)"
  echo "  bash ag.sh preview     Git 변경분만 리뷰"
  echo ""
  echo "  ── AI 자동 개발 ─────────────────────────────"
  echo "  bash ag.sh ai          전체 AI 파이프라인"
  echo "  bash ag.sh ai-review   리뷰+테스트+보안만"
  echo "  bash ag.sh ai-fast     첫 오류시 즉시 중단"
  echo ""
  echo "  ── 히스토리 & 분석 ──────────────────────────"
  echo "  bash ag.sh history     리뷰 기록 보기"
  echo "  bash ag.sh trend       코드 품질 추세"
  echo "  bash ag.sh team        에이전트 팀 정보"
  echo ""
  echo "  ── 기타 ─────────────────────────────────────"
  echo "  bash ag.sh update      안티그래비티 업데이트"
  echo "  bash ag.sh help        이 도움말 표시"
  echo ""
}

case "\${1:-help}" in
  # ── 기본 명령어 ──
  review)
    ag-review review -p "\$PROJECT"
    ;;
  fix)
    ag-review fix -p "\$PROJECT"
    ;;
  check)
    ag-review check -p "\$PROJECT"
    ;;
  preview)
    ag-review preview -p "\$PROJECT" --base-branch "\${2:-main}"
    ;;

  # ── AI 자동 개발 파이프라인 ──
  ai)
    ag-review orchestrate -p "\$PROJECT"
    ;;
  ai-review)
    ag-review orchestrate -p "\$PROJECT" --phases review,test,security
    ;;
  ai-fast)
    ag-review orchestrate -p "\$PROJECT" --fail-fast
    ;;
  ai-code)
    ag-review orchestrate -p "\$PROJECT" --phases plan,code,review
    ;;
  ai-secure)
    ag-review orchestrate -p "\$PROJECT" --phases security
    ;;
  ai-deploy)
    ag-review orchestrate -p "\$PROJECT" --phases code,review,test,security,deploy
    ;;

  # ── 히스토리 & 분석 ──
  history)
    ag-review history -p "\$PROJECT" -n "\${2:-10}"
    ;;
  history-all)
    ag-review history -p "\$PROJECT" -n 100
    ;;
  history-json)
    ag-review history -p "\$PROJECT" --json
    ;;
  trend)
    ag-review trend -p "\$PROJECT"
    ;;
  trend-json)
    ag-review trend -p "\$PROJECT" --json
    ;;
  team)
    ag-review team
    ;;

  # ── 기타 ──
  update)
    ag-review update
    ;;
  help|*)
    show_help
    ;;
esac
SCRIPT

chmod +x ag.sh
echo "    ag.sh 생성 완료"

# ─── 완료 ───
echo ""
echo "  ════════════════════════════════════════════"
echo "  설정 완료!"
echo "  ════════════════════════════════════════════"
echo ""
echo "  다음 단계:"
echo "    1. .env 파일에 API 키 입력 (AI 코드 생성 사용시)"
echo "       nano $PROJECT_PATH/.env"
echo ""
echo "    2. 코드리뷰 실행:"
echo "       cd $PROJECT_PATH"
echo "       bash ag.sh review"
echo ""
echo "    3. 전체 명령어 보기:"
echo "       bash ag.sh help"
echo ""
