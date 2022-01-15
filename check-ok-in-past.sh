#!/usr/bin/env bash

current_tree_sha=$(git ls-tree HEAD -- "$@" | tr / \| | git mktree)
okCommits=$(curl --fail "$CI_SERVER_URL/api/v4/projects/${CI_PROJECT_ID}/jobs?scope=success&per_page=1000&page=&private_token=$TOKEN" |
  fx ".filter(job => job.name === '$CI_JOB_NAME').map(job => job.commit.id).join('\n')")
for commit in $okCommits; do
  tree_sha=$(git ls-tree $commit -- "$@" | tr / \| | git mktree)
  if [[ "$tree_sha" = "$current_tree_sha" ]]; then
    echo "✅ $current_tree_sha tree found in commit $commit"
    exit 0
  fi
done

echo "❌ tree not found in last 1000 success jobs of the project"
exit 1
