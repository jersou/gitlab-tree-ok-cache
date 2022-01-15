#!/usr/bin/env bash

current_tree_sha=$(git ls-tree HEAD -- "$@" | tr / \| | git mktree)
echo current_tree_sha=$current_tree_sha
found=""
commits=$(curl --fail "https://gitlab.com/api/v4/projects/${CI_PROJECT_ID}/jobs?scope=success&per_page=1000&page=&private_token=$TOKEN" |
  fx ".filter(job => job.name==='$CI_JOB_NAME').map(job=>  job.commit.id).join('\n')")
for commit in $commits; do
  tree_sha=$(git ls-tree $commit -- "$@" | tr / \| | git mktree)
  # echo "commit $commit : tree_sha=$tree_sha"
  if [[ "$tree_sha" = "$current_tree_sha" ]]; then
    found="$commit"
    break
  fi
done

if [[ "$found" = "" ]]; then
  echo "❌ tree not found in last 1000 success jobs of the project"
  exit 1
else
  echo "✅ tree found in commit $found"
fi
