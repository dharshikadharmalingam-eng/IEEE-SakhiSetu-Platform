#!/bin/sh
# usage: srv.sh start|stop  (API on :5000)
. /home/claude/env.sh
case "$1" in
  stop) [ -f /tmp/api.pid ] && kill $(cat /tmp/api.pid) 2>/dev/null; rm -f /tmp/api.pid; sleep 1;;
  start) $0 stop; cd /home/claude/artifacts/api-server && (PORT=5000 nohup node --enable-source-maps dist/index.mjs > /tmp/api.log 2>&1 & echo $! > /tmp/api.pid); sleep 3; tail -2 /tmp/api.log;;
esac
