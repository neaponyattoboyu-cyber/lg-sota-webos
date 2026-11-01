#!/bin/sh
APPDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BIN="${APPDIR}/bin/sing-box"
CONFIG="${SOTA_CONFIG:-/media/developer/sota-lg/config.json}"
STATE='/tmp/sota-lg'
PIDFILE="${STATE}/client.pid"
LOG="${STATE}/client.log"
mkdir -p -- "${STATE}"
chmod 700 -- "${STATE}"

reply() {
    printf '{"running":%s,"message":"%s"}\n' "$1" "$2"
}

running() {
    [ -f "${PIDFILE}" ] || return 1
    read -r client_pid <"${PIDFILE}"
    case "${client_pid}" in ''|*[!0-9]*) return 1 ;; esac
    kill -0 "${client_pid}" 2>/dev/null || return 1
    [ -r "/proc/${client_pid}/cmdline" ] || return 1
    tr '\000' '\n' 2>/dev/null <"/proc/${client_pid}/cmdline" | head -n 1 | grep -Fqx -- "${BIN}"
}

stop_owned() {
    if running; then
        kill -TERM "${client_pid}"
        count=0
        while running && [ "${count}" -lt 5 ]; do
            sleep 1
            count=$((count + 1))
        done
        running && return 1
    fi
    rm -f -- "${PIDFILE}"
    return 0
}

validate() {
    [ "$(id -u)" = 0 ] || return 1
    [ -c '/dev/net/tun' ] || return 2
    "${BIN}" version >"${STATE}/version.log" 2>&1 || return 3
    "${BIN}" check -c "${CONFIG}" >"${LOG}" 2>&1 || return 4
}

case "${1:-status}" in
    validate)
        validate
        result=$?
        if [ "${result}" -eq 0 ]; then reply false ''; else reply false 'Проверка службы VPN не пройдена.'; fi
        exit "${result}"
        ;;
    start)
        if running; then reply true ''; exit 0; fi
        if ! validate; then reply false 'Служба VPN не готова к работе.'; exit 1; fi
        if ip link show sotavpn0 >/dev/null 2>&1; then reply false 'Предыдущее подключение ещё завершается. Перезагрузите телевизор.'; exit 1; fi
        if ip rule show | grep -q 'lookup 20261'; then reply false 'Не удалось подготовить подключение. Перезагрузите телевизор.'; exit 1; fi
        nohup "${BIN}" run -c "${CONFIG}" >"${LOG}" 2>&1 </dev/null 9>&- &
        printf '%s\n' "$!" >"${PIDFILE}"
        sleep 1
        if ! running || ! ip link show sotavpn0 >/dev/null 2>&1; then
            stop_owned
            reply false 'Не удалось запустить VPN.'
            exit 1
        fi
        if curl -fsS --connect-timeout 4 --max-time 12 -o /dev/null 'https://www.gstatic.com/generate_204' >>"${LOG}" 2>&1; then
            nohup /bin/sh "${APPDIR}/control.sh" watch "${client_pid}" >/dev/null 2>&1 </dev/null 9>&- &
            reply true ''
            exit 0
        fi
        if stop_owned; then
            reply false 'Сервер не ответил. Подключение выключено; попробуйте ещё раз.'
        else
            reply true 'Не удалось проверить подключение. Попробуйте выключить VPN.'
        fi
        exit 1
        ;;
    stop)
        if stop_owned; then reply false ''; else reply true 'Не удалось остановить подключение. Перезагрузите телевизор.'; exit 1; fi
        ;;
    status)
        if running; then reply true ''; else reply false ''; fi
        ;;
    watch)
        while running && [ "${client_pid}" = "${2:-}" ]; do
            if [ ! -f "${APPDIR}/appinfo.json" ]; then stop_owned; exit 0; fi
            if [ -f "${LOG}" ] && [ "$(wc -c <"${LOG}")" -gt 262144 ]; then : >"${LOG}"; fi
            sleep 30
        done
        ;;
    *) reply false 'Неизвестная команда.'; exit 1 ;;
esac
