#!/usr/bin/env bash
# Synthetic release control-flow checks: no network, services, credentials or owner data.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
suite="$(mktemp -d)"
trap 'rm -rf "$suite"' EXIT
mkdir -p "$suite/bin"
export PATH="$suite/bin:$PATH"
cat > "$suite/bin/git" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *rev-parse*) echo new ;;
  *archive*) tar -cf - --files-from /dev/null ;;
esac
SH
cat > "$suite/bin/pnpm" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$APP_ROOT/build.log"
SH
cat > "$suite/bin/sudo" <<'SH'
#!/usr/bin/env bash
printf '%s %s\n' "$*" "$(readlink "$APP_ROOT/current" || true)" >> "$APP_ROOT/service.log"
if [ "$2" = restart ] && [ "${RESTART_FAIL:-}" = "$(readlink "$APP_ROOT/current")" ]; then exit 1; fi
SH
cat > "$suite/bin/curl" <<'SH'
#!/usr/bin/env bash
if [ "${HEALTH_FAIL:-}" = "$(readlink "$APP_ROOT/current")" ]; then exit 1; fi
echo '{"status":"ok"}'
SH
cat > "$suite/bin/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
# Git Bash cannot create native symlinks without Windows privileges. On Windows only,
# model link targets as text files; Linux CI exercises actual ln/readlink/mv as well.
case "$(uname -s)" in
  MINGW*|MSYS*)
    cat > "$suite/bin/ln" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$2" > "$3"
SH
    cat > "$suite/bin/readlink" <<'SH'
#!/usr/bin/env bash
cat "$1" 2>/dev/null
SH
    ;;
esac
chmod +x "$suite/bin/"*

fresh() {
  export APP_ROOT="$suite/$1"
  unset RESTART_FAIL HEALTH_FAIL
  mkdir -p "$APP_ROOT/releases/old/apps/server/migrations" "$APP_ROOT/releases/new/apps/server/migrations"
  touch "$APP_ROOT/releases/old/apps/server/migrations/0001_init.sql"
  touch "$APP_ROOT/releases/new/apps/server/migrations/0001_init.sql"
}
link_old() { (cd "$APP_ROOT" && ln -sfn releases/old current); }
run() {
  result=0
  bash "$repo/deploy/scripts/release.sh" "$@" > "$APP_ROOT/output" 2>&1 || result=$?
}
check() { if ! "$@"; then cat "$APP_ROOT/output" >&2; echo "FAIL: $*" >&2; exit 1; fi; }

fresh prepare-first
run --prepare new
check test "$result" -eq 0
check test ! -e "$APP_ROOT/current"
check test ! -e "$APP_ROOT/service.log"

fresh prepare-existing
link_old
run --prepare new
check test "$result" -eq 0
check test "$(readlink "$APP_ROOT/current")" = releases/old
check test ! -e "$APP_ROOT/service.log"

fresh build-only
rm "$APP_ROOT/releases/new/apps/server/migrations/0001_init.sql"
rmdir "$APP_ROOT/releases/new/apps/server/migrations" "$APP_ROOT/releases/new/apps/server" "$APP_ROOT/releases/new/apps" "$APP_ROOT/releases/new"
run --prepare new
check test "$result" -eq 0
check test -d "$APP_ROOT/releases/new"
check grep -q 'install --frozen-lockfile' "$APP_ROOT/build.log"
check grep -q build "$APP_ROOT/build.log"
check test ! -e "$APP_ROOT/current"

fresh healthy
link_old
run new
check test "$result" -eq 0
check test "$(readlink "$APP_ROOT/current")" = releases/new
check grep -q ' new$' "$APP_ROOT/releases.log"

fresh restart-fails
link_old
export RESTART_FAIL=releases/new
run new
check test "$result" -ne 0
check test "$(readlink "$APP_ROOT/current")" = releases/old
check grep -q 'restart moriium-dashboard releases/old' "$APP_ROOT/service.log"
check test ! -e "$APP_ROOT/releases.log"

fresh health-fails
link_old
export HEALTH_FAIL=releases/new
run new
check test "$result" -ne 0
check test "$(readlink "$APP_ROOT/current")" = releases/old

fresh migration-fails
link_old
touch "$APP_ROOT/releases/new/apps/server/migrations/0002_change.sql"
export HEALTH_FAIL=releases/new
run new
check test "$result" -ne 0
check test "$(readlink "$APP_ROOT/current")" = releases/new
check grep -q 'stop moriium-dashboard' "$APP_ROOT/service.log"
check test "$(grep -c restart "$APP_ROOT/service.log")" -eq 1

fresh first-start-fails
export RESTART_FAIL=releases/new
run new
check test "$result" -ne 0
check grep -q 'stop moriium-dashboard' "$APP_ROOT/service.log"

fresh migration-changed
link_old
echo 'different migration' > "$APP_ROOT/releases/new/apps/server/migrations/0001_init.sql"
export RESTART_FAIL=releases/new
run new
check test "$result" -ne 0
check test "$(readlink "$APP_ROOT/current")" = releases/new
check test "$(grep -c restart "$APP_ROOT/service.log")" -eq 1

fresh retry-current
(cd "$APP_ROOT" && ln -sfn releases/new current)
run new
check test "$result" -eq 0
check grep -q 'restart moriium-dashboard releases/new' "$APP_ROOT/service.log"

fresh fallback-fails
link_old
export RESTART_FAIL=releases/new HEALTH_FAIL=releases/old
run new
check test "$result" -ne 0
check test "$(readlink "$APP_ROOT/current")" = releases/old
check test "$(grep -c stop "$APP_ROOT/service.log")" -eq 2

echo 'PASS: 11 synthetic release scenarios'
