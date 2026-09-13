#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
demo_dir="$(mktemp -d "${TMPDIR:-/tmp}/redpen-demo.XXXXXX")"
trap 'rm -rf "$demo_dir"' EXIT

cd "$demo_dir"
git init -q
git config user.name "Redpen Demo"
git config user.email "demo@redpen.dev"

cat > package.json <<'EOF'
{
  "type": "module",
  "scripts": {
    "test": "node --test",
    "build": "node --check src/pagination.mjs"
  }
}
EOF

mkdir -p src tests
cat > src/pagination.mjs <<'EOF'
export function page(items, cursor) {
  if (cursor === null) return [];
  return items.slice(cursor, cursor + 2);
}
EOF

cat > tests/pagination.test.mjs <<'EOF'
import assert from "node:assert/strict";
import test from "node:test";
import { page } from "../src/pagination.mjs";

test("paginates from a cursor", () => {
  assert.deepEqual(page([1, 2, 3], 1), [2, 3]);
});
EOF

git add .
git commit -qm "demo baseline"

node "$repo_root/dist/cli.js" start "Fix pagination when cursor is null"

cat > src/pagination.mjs <<'EOF'
export function page(items, cursor) {
  const start = cursor ?? 0;
  return items.slice(start, start + 2);
}
EOF

cat >> tests/pagination.test.mjs <<'EOF'

test("starts from the beginning when the cursor is null", () => {
  assert.deepEqual(page([1, 2, 3], null), [1, 2]);
});
EOF

node "$repo_root/dist/cli.js" claims 'Updated src/pagination.mjs. Added regression coverage. All tests pass. Build succeeds. No breaking changes.'

set +e
node "$repo_root/dist/cli.js" check --no-color --timeout 30
exit_code=$?
set -e

if [[ "$exit_code" -ne 1 ]]; then
  echo "Demo expected a NOT DONE verdict (exit 1), received exit $exit_code." >&2
  exit 2
fi
