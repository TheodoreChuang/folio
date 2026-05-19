#!/usr/bin/env bash
# Usage: pnpm pr:create [title]
# Takes screenshots of all app pages, commits them to the current branch,
# pushes, and opens a PR with the screenshots embedded in the description.
# Title defaults to the last commit's subject line.

set -euo pipefail

BRANCH=$(git branch --show-current)

if [[ "$BRANCH" == "main" ]]; then
  echo "error: cannot create a PR from main" >&2
  exit 1
fi

TITLE="${1:-$(git log -1 --pretty=%s)}"

echo "▶ Taking screenshots..."
pnpm playwright test --grep @screenshot

# Commit screenshots if anything changed (force-add since screenshots/ is gitignored)
git add -f screenshots/ 2>/dev/null || true
if ! git diff --staged --quiet; then
  git commit -m "chore: update screenshots"
fi

echo "▶ Pushing $BRANCH..."
git push -u origin "$BRANCH"

# Build markdown screenshot section using raw GitHub URLs
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

SCREENSHOT_MD="## Screenshots\n\n"
if compgen -G "screenshots/*.png" > /dev/null 2>&1; then
  for file in screenshots/*.png; do
    name=$(basename "$file" .png)
    url="https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}"
    SCREENSHOT_MD+="**${name}**\n\n![$name]($url)\n\n"
  done
else
  SCREENSHOT_MD+="_No screenshots found._\n"
fi

echo "▶ Creating PR: $TITLE"
gh pr create --title "$TITLE" --body "$(printf "%b" "$SCREENSHOT_MD")"
