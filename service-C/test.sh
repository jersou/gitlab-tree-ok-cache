#!/bin/sh

# change the value to generate new git tree SHA
RANDOM_VALUE=xQJWNhU518vd_hcASO7d94cqVsChgfZY
echo RANDOM_VALUE=$RANDOM_VALUE
echo RANDOM_VALUE=$RANDOM_VALUE > result.txt

is_ok=true

if [ $is_ok = true ]
then
  echo test OK
else
  echo test KO
  exit 1
fi
