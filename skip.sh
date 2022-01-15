#!/usr/bin/env bash
# This script get last 1000 successful job of the projet, filter by the job name,
#  and for each, check if the SKIP_IF_TREE_OK_IN_PAST file state is the same as the current state.
# If true, then the find job artifacts are download and unzip. The script exit 0.
# The file /tmp/ci-skip keep the result of this process.
#
# ⚠️ Requirement :
#   - the variable SKIP_IF_TREE_OK_IN_PAST must contains the paths used by the job
#   - docker images/gitlab runner need : bash, curl, git, unzip, fx
#   - if the nested jobs of current uses the dependencies key with current, the dependencies files need to be in an artifact
#   - CI variable changes are not detected
#   - need API_READ_TOKEN (personal access tokens that have read_api scope)
#   - set GIT_DEPTH variable to 1000 or more
if [[ "$SKIP_IF_TREE_OK_IN_PAST" = "" ]]; then
  echo -e "\e[1;41;39m    ⚠️ The SKIP_IF_TREE_OK_IN_PAST variable is empty, set the list of paths to check    \e[0m"
  exit 1
fi
if [[ "$API_READ_TOKEN" = "" ]]; then
  echo -e "\e[1;41;39m    ⚠️ The API_READ_TOKEN variable is empty !    \e[0m"
  exit 2
fi
if test -f /tmp/ci-skip; then
  [[ "$(cat /tmp/ci-skip)" = "true" ]] && exit 0
  exit 3
fi

current_tree_sha=$(git ls-tree HEAD -- $SKIP_IF_TREE_OK_IN_PAST | tr / \| | git mktree)

curl --silent --fail "$CI_API_V4_URL/projects/${CI_PROJECT_ID}/jobs?scope=success&per_page=1000&page=&private_token=${API_READ_TOKEN}" |
  fx ".filter(job => job.name === '$CI_JOB_NAME').map(j => [j.commit.id, j.web_url, j.artifacts_expire_at].join(' ')).join('\n')" |
  while read commit  web_url  artifacts_expire_at ; do
    tree_sha=$(git ls-tree $commit -- $SKIP_IF_TREE_OK_IN_PAST | tr / \| | git mktree)
    if [[ "$tree_sha" = "$current_tree_sha" ]]; then
      if [[ "$artifacts_expire_at" != "" ]]; then
        echo  "artifacts_expire_at: $artifacts_expire_at"
        curl -o artifact.zip "$web_url/artifacts/download" || break
        unzip artifact.zip
        rm artifact.zip
        ls -al
      fi
      echo -e "\e[1;43;30m    ✅ $current_tree_sha tree found in job $web_url   \e[0m"
      echo true >/tmp/ci-skip
     # break
    fi
  done

if test -f /tmp/ci-skip; then
  exit 0
else
  echo -e "\e[1;43;30m    ❌ tree not found in last 1000 success jobs of the project    \e[0m"
  echo false >/tmp/ci-skip
  exit 4
fi
