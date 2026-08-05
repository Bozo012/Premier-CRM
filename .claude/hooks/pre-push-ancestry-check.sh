#!/usr/bin/env bash
# PreToolUse hook for `git push` — catches the squash-merge diamond that produced PR #72's
# 70-file bloat by verifying origin/main is still an ancestor of HEAD after a fresh fetch.
set -u

cat >/dev/null # drain stdin (hook input JSON not needed beyond the "if" filter that gated us here)

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
}

case "$root" in
  */Premier-CRM|*/Premier-CRM/*) ;;
  *)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    exit 0
    ;;
esac

git fetch origin >/dev/null 2>&1

diffstat=$(git diff --stat origin/main...HEAD 2>&1)
log=$(git log --oneline origin/main..HEAD 2>&1)
commit_count=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')

if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  reason=$(cat <<EOF
Blocked push: origin/main is not an ancestor of HEAD after fetch — this branch is not a
simple fast-forward descendant of origin/main. That is the exact squash-merge diamond
pattern that produced PR #72's 70-file, mergeable:false diff (a reused branch whose earlier
commits were squash-merged into main under different SHAs).

--- git log --oneline origin/main..HEAD ---
$log

--- git diff --stat origin/main...HEAD ---
$diffstat

Diagnose branch ancestry before pushing:
  git merge-base origin/main HEAD
  git diff <pre-change-commit> origin/main   (check if content already landed)

If this is a reused long-lived branch, cut a fresh branch from origin/main and cherry-pick
only the commit(s) not already on main, per the branch-per-PR workflow.
EOF
)
  jq -n --arg reason "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
fi

msg="Pre-push ancestry check OK: $commit_count commit(s) ahead of origin/main, fast-forward descendant confirmed."
jq -n --arg msg "$msg" '{systemMessage:$msg,hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow"}}'
exit 0
