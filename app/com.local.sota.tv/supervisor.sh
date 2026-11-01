#!/bin/sh
umask 077
APPDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p /tmp/sota-lg
chmod 700 /tmp/sota-lg
exec 9>/tmp/sota-lg/supervisor.lock
flock -n 9 || exit 0
while [ -f "${APPDIR}/appinfo.json" ]; do
    node "${APPDIR}/supervisor.js" 9>&- &
    child=$!
    trap 'kill -TERM "${child}" 2>/dev/null; exit 0' TERM INT
    wait "${child}"
    result=$?
    [ "${result}" = 73 ] || exit "${result}"
    sleep 1
done
