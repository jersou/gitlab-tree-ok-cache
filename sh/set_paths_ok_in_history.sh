#!/bin/sh
set -o errexit
sha=$(sh/get_tree_SHA_of_paths.sh "${@}")
echo "$sha:${CI_JOB_ID}" >> .ci_ok_cache_${CI_JOB_NAME}_CI_JOB
