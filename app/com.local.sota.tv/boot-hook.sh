#!/bin/sh
# Homebrew Channel runs this hook after root and developer storage are ready.
APP='/media/developer/apps/usr/palm/applications/com.local.sota.tv'
[ -f "${APP}/supervisor.sh" ] || exit 0
nohup /bin/sh "${APP}/supervisor.sh" >/tmp/sota-lg-supervisor.log 2>&1 </dev/null &
exit 0
