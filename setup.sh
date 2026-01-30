#!/usr/bin/env bash
# ============================================================
#  Antigravity Code Review Agent - 원클릭 설치 스크립트
#  누구나 실행 한 번으로 글로벌 설치가 완료됩니다.
# ============================================================
set -e

echo ""
echo "========================================"
echo "  Antigravity Code Review Agent Setup"
echo "========================================"
echo ""

# --------------------------------------------------
# 1) Node.js 설치 확인
# --------------------------------------------------
echo "[1/5] Node.js 확인 중..."
if ! command -v node &> /dev/null; then
  echo ""
  echo "  Node.js가 설치되어 있지 않습니다."
  echo "  아래 사이트에서 LTS 버전을 설치해주세요:"
  echo ""
  echo "    https://nodejs.org/ko"
  echo ""
  echo "  설치 후 이 스크립트를 다시 실행하세요."
  exit 1
fi

NODE_VER=$(node -v)
echo "  Node.js ${NODE_VER} 확인됨"

# --------------------------------------------------
# 2) npm 확인
# --------------------------------------------------
echo "[2/5] npm 확인 중..."
if ! command -v npm &> /dev/null; then
  echo "  npm을 찾을 수 없습니다. Node.js를 재설치해주세요."
  exit 1
fi
NPM_VER=$(npm -v)
echo "  npm ${NPM_VER} 확인됨"

# --------------------------------------------------
# 3) 의존성 설치
# --------------------------------------------------
echo "[3/5] 의존성 설치 중..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
npm install --silent
echo "  의존성 설치 완료"

# --------------------------------------------------
# 4) TypeScript 빌드
# --------------------------------------------------
echo "[4/5] 빌드 중..."
npm run build --silent
echo "  빌드 완료"

# --------------------------------------------------
# 5) 글로벌 등록
# --------------------------------------------------
echo "[5/5] 글로벌 명령어 등록 중..."
npm link 2>/dev/null || {
  echo ""
  echo "  권한 문제가 발생했습니다. sudo로 재시도합니다..."
  sudo npm link
}

echo ""
echo "========================================"
echo "  설치 완료!"
echo "========================================"
echo ""
echo "  이제 어느 프로젝트에서든 아래 명령어를 사용할 수 있습니다:"
echo ""
echo "    ag-review review          전체 검증 (컴파일+린트+테스트)"
echo "    ag-review check           빠른 검증 (컴파일+린트)"
echo "    ag-review review --json   JSON 리포트 출력"
echo "    ag-review --help          전체 도움말"
echo ""
echo "  특정 프로젝트에 설정 파일을 추가하려면:"
echo ""
echo "    ag-review-init            (프로젝트 디렉토리에서 실행)"
echo ""
