#!/bin/sh
umask 077
APPDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if command -v node >/dev/null 2>&1; then
    exec node "${APPDIR}/backend.js" "$@"
fi
printf '{"error":true,"message":"Служба приложения недоступна."}\n'
exit 1
