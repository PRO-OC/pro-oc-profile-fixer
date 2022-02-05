#!/bin/sh

cat greg-before.log | grep '^popup.js:*' | sort -k8 -n > grep-after.log
