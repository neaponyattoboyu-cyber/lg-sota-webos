#!/bin/sh
set -eu
umask 077
APP='/media/developer/apps/usr/palm/applications/com.local.sota.tv'
DATA='/media/developer/sota-lg'
UPDATES="${DATA}/updates"
STATE='/tmp/sota-lg'
mkdir -p "${UPDATES}" "${STATE}"
exec 9>"${STATE}/update.lock"
flock -n 9 || exit 1
BACKUP="${UPDATES}/backup-$(date +%s)"
mkdir -p "${BACKUP}"
LOG="${BACKUP}/install.log"
ok=false
running=false
changed=false
: >"${LOG}"
install_package() {
    package="$1"
    fifo="${BACKUP}/install.fifo"
    rm -f -- "${fifo}"
    mkfifo "${fifo}"
    payload="$(printf '{"id":"com.ares.defaultName","ipkUrl":"%s","subscribe":true}' "${package}")"
    luna-send -w 60000 -i 'luna://com.webos.appInstallService/dev/install' "${payload}" >"${fifo}" 2>>"${LOG}" &
    rpc=$!
    result="$(fgrep -m 1 -e 'installed' -e 'failed' -- "${fifo}")" || result='No result'
    kill -TERM "${rpc}" 2>/dev/null || true
    rm -f -- "${fifo}"
    printf '%s\n' "${result}" >>"${LOG}"
    case "${result}" in *installed*) return 0 ;; *) return 1 ;; esac
}
harden() {
    find "${APP}" -type d -exec chmod 755 {} \;
    find "${APP}" -type f -exec chmod 644 {} \;
    chmod 755 "${APP}/bin/sing-box" "${APP}/control.sh" "${APP}/launch.sh" "${APP}/supervisor.sh" "${APP}/boot-hook.sh" "${APP}/update-install.sh"
    package_dir='/media/developer/apps/usr/palm/packages/com.local.sota.tv'
    if [ -d "${package_dir}" ]; then chmod 755 "${package_dir}"; chmod 644 "${package_dir}/packageinfo.json"; fi
}
finish() {
    trap - EXIT
    set +e
    if [ "${ok}" != true ] && [ "${changed}" = true ]; then
        sh "${APP}/control.sh" stop >>"${LOG}" 2>&1
        [ ! -f "${BACKUP}/previous.ipk" ] || install_package "${BACKUP}/previous.ipk"
        mkdir -p "${APP}"
        cp -a "${BACKUP}/app/." "${APP}/"
        cp "${BACKUP}/config.json" "${DATA}/config.json"
        chmod 600 "${DATA}/config.json"
        harden
        if [ "${running}" = true ]; then sh "${APP}/control.sh" start >>"${LOG}" 2>&1; fi
    fi
    if [ "${ok}" = true ]; then printf '{"ok":true}\n'; else printf '{"ok":false,"message":"Не удалось обновить приложение. Предыдущая версия восстановлена."}\n'; fi
}
trap finish EXIT
[ "$(id -u)" = 0 ]
# Recheck signature, platform, version and complete file hash immediately before installation.
node -e 'var U=require(process.argv[1]+"/lib/update").Updater,S=require(process.argv[1]+"/lib/storage").Store;new U(new S("/media/developer/sota-lg"),process.argv[1]).verifyReady()' "${APP}"
cp -a "${APP}" "${BACKUP}/app"
cp "${DATA}/config.json" "${BACKUP}/config.json"
[ ! -f "${UPDATES}/installed.ipk" ] || cp "${UPDATES}/installed.ipk" "${BACKUP}/previous.ipk"
if sh "${APP}/control.sh" status | grep -q '"running":true'; then running=true; fi
changed=true
sh "${APP}/control.sh" stop >>"${LOG}" 2>&1
install_package "${UPDATES}/candidate.ipk"
harden
node --check "${APP}/backend.js" >>"${LOG}" 2>&1
"${APP}/bin/sing-box" check -c "${DATA}/config.json" >>"${LOG}" 2>&1
if [ "${running}" = true ]; then sh "${APP}/control.sh" start >>"${LOG}" 2>&1; fi
cp "${UPDATES}/candidate.ipk" "${UPDATES}/installed.ipk"
chmod 600 "${UPDATES}/installed.ipk"
rm -f -- "${UPDATES}/ready.json" "${UPDATES}/candidate.ipk"
cp "${APP}/boot-hook.sh" '/var/lib/webosbrew/init.d/80-sota-vpn'
chmod 755 '/var/lib/webosbrew/init.d/80-sota-vpn'
ok=true
