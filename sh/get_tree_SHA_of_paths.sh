#!/bin/sh
set -o errexit
# removes everything from the index
git rm --cached -r -- . >/dev/null
# restore only paths argument in the index
git reset HEAD -- "${@}" >/dev/null
# get the SHA of the index tree
git write-tree
# restore the index to HEAD
git reset HEAD -- . >/dev/null
