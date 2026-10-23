#!/bin/sh
# Throwaway server with a temporary database, then the partner-sync tests.
cd "$(dirname "$0")/.."
export DATABASE_FILE=/tmp/wassce-test-$$.sqlite JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(40).toString('hex'))")
export PARTNER_SYNC_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") PORT=3071 NODE_ENV=test
node src/index.js > /tmp/wassce-test-server.log 2>&1 &
PID=$!
sleep 2
API=http://127.0.0.1:3071 node test/partner.test.js
CODE=$?
kill $PID; rm -f $DATABASE_FILE*
exit $CODE
