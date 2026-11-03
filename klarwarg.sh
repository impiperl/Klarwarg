#!/usr/bin/env bash
# Klarwarg auf einem Server einrichten und betreiben. Braucht nur Docker (oder Podman).
#
#   ./klarwarg.sh install   einrichten — fragt, wie die Website erreichbar sein soll
#   ./klarwarg.sh update    neue Version übernehmen (vorher automatisch eine Sicherung)
#   ./klarwarg.sh backup    Sicherung der Website nach backups/
#   ./klarwarg.sh status    läuft es, unter welcher Adresse, Einrichtungscode
#   ./klarwarg.sh restart   neu starten, z. B. nach Änderungen in .env
#   ./klarwarg.sh stop      anhalten
#   ./klarwarg.sh logs      Protokoll ansehen (Strg+C beendet)
#
# Anleitung: INSTALLATION.md
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

CMD=${1:-help}
IMAGE=klarwarg:local
APP=klarwarg
CADDY=klarwarg-caddy
NET=klarwarg
CADDY_IMAGE=docker.io/library/caddy:2

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Docker oder Podman --------------------------------------------------------------------

use_engine() {
  if [ -n "${KLARWARG_ENGINE:-}" ]; then E=$KLARWARG_ENGINE
  elif command -v docker >/dev/null 2>&1; then E=docker
  elif command -v podman >/dev/null 2>&1; then E=podman
  else
    fail "Weder Docker noch Podman ist installiert.
Docker installieren: https://docs.docker.com/engine/install/ — danach dieses Skript noch einmal starten."
  fi
  $E info >/dev/null 2>&1 || fail "$E läuft nicht, oder es braucht Admin-Rechte. Versuch es mit:  sudo $0 $CMD"
  # Docker startet Container nach einem Server-Neustart von selbst wieder; Podman nur mit „always“.
  if [ "$E" = podman ]; then RESTART=always; else RESTART=unless-stopped; fi
}

exists() { $E container inspect "$1" >/dev/null 2>&1; }
running() { [ "$($E container inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }
remove() { $E rm -f "$1" >/dev/null 2>&1 || true; }
port_busy() { command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }

load_env() {
  [ -f .env ] || fail "Klarwarg ist hier noch nicht eingerichtet. Zuerst:  $0 install"
  grep -q '^KLARWARG_MODE=' .env || fail "Die .env in diesem Ordner gehört zum Entwicklungsbetrieb, nicht zu klarwarg.sh.
Für den Serverbetrieb Klarwarg in einen eigenen Ordner kopieren (z. B. /srv/klarwarg) und dort installieren."
  set -a; . ./.env; set +a
  KLARWARG_PORT=${KLARWARG_PORT:-4317}
  KLARWARG_NETWORK=${KLARWARG_NETWORK:-}
}

address() {
  case $KLARWARG_MODE in
    local) printf '%s' "$PUBLIC_ORIGIN" ;;
    *) printf 'https://%s' "$DOMAIN" ;;
  esac
}

# --- Bausteine -----------------------------------------------------------------------------

build() {
  say "Baue Klarwarg … (beim ersten Mal einige Minuten)"
  $E build -t "$IMAGE" .
}

start_app() {
  mkdir -p data
  local args=(run -d --name "$APP" --restart "$RESTART" --env-file .env -v "$PWD/data:/data:Z")
  case $KLARWARG_MODE in
    https) args+=(--network "$NET") ;;
    proxy)
      if [ -n "$KLARWARG_NETWORK" ]; then args+=(--network "$KLARWARG_NETWORK")
      else args+=(-p "127.0.0.1:$KLARWARG_PORT:4317"); fi ;;
    local) args+=(-p "$KLARWARG_PORT:4317") ;;
    *) fail "Unbekannter KLARWARG_MODE in .env: $KLARWARG_MODE" ;;
  esac
  $E "${args[@]}" "$IMAGE" >/dev/null
}

start_caddy() {
  # Caddy holt und erneuert das HTTPS-Zertifikat für die Domain selbst (Let's Encrypt).
  $E run -d --name "$CADDY" --restart "$RESTART" --network "$NET" \
    -p 80:80 -p 443:443 -p 443:443/udp \
    -v klarwarg-caddy-data:/data -v klarwarg-caddy-config:/config \
    "$CADDY_IMAGE" caddy reverse-proxy --from "$DOMAIN" --to "$APP:4317" >/dev/null
}

wait_healthy() {
  local i
  for i in $(seq 1 40); do
    if $E exec "$APP" node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  $E logs --tail 30 "$APP" >&2 || true
  fail "Klarwarg ist nicht richtig gestartet (Protokoll siehe oben)."
}

start_all() {
  remove "$APP"; remove "$CADDY"
  if [ "$KLARWARG_MODE" = https ]; then
    $E network inspect "$NET" >/dev/null 2>&1 || $E network create "$NET" >/dev/null
  fi
  start_app
  wait_healthy
  if [ "$KLARWARG_MODE" = https ]; then start_caddy; fi
}

setup_code() {
  # Der Server nennt den Code bei jedem Start, solange es noch keinen Adminzugang gibt.
  $E logs "$APP" 2>&1 | awk '/^Klarwarg API/{c=""} /^Einrichtungscode für den Adminzugang:/{c=$NF} END{print c}'
}

backup() {
  mkdir -p backups
  local file was_running=no
  file="backups/klarwarg-$(date +%Y%m%d-%H%M%S).tar.gz"
  if running "$APP"; then was_running=yes; $E stop "$APP" >/dev/null; fi
  $E run --rm -v "$PWD/data:/data:Z" --entrypoint tar "$IMAGE" czf - -C /data . > "$file"
  if [ $was_running = yes ]; then $E start "$APP" >/dev/null; wait_healthy; fi
  echo "Sicherung: $file"
}

# --- Befehle -------------------------------------------------------------------------------

ask_domain() {
  local d
  while :; do
    read -r -p "Deine Domain (z. B. praxis-muster.de): " d
    d=$(printf '%s' "$d" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##; s/[[:space:]]//g')
    if printf '%s' "$d" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then DOMAIN=$d; return; fi
    echo "Das sieht nicht nach einer Domain aus. Bitte nur den Namen, ohne Pfad."
  done
}

ask_port() {
  local p
  read -r -p "Port für Klarwarg [4317]: " p
  p=${p:-4317}
  printf '%s' "$p" | grep -Eq '^[0-9]+$' || fail "Ein Port ist eine Zahl."
  port_busy "$p" && fail "Port $p ist schon belegt. Starte noch einmal und nimm einen anderen."
  KLARWARG_PORT=$p
}

cmd_install() {
  if [ -f .env ]; then
    grep -q '^KLARWARG_MODE=' .env || load_env  # meldet den Entwicklungs-.env-Fall
    fail "Klarwarg ist hier schon eingerichtet. Neue Version:  $0 update"
  fi
  use_engine

  bold "Klarwarg einrichten"
  echo
  echo "Wie soll deine Website erreichbar sein?"
  echo "  1) Unter meiner eigenen Domain — Klarwarg kümmert sich um HTTPS   (empfohlen)"
  echo "  2) Unter meiner eigenen Domain — ein vorhandener Webserver (z. B. nginx) leitet weiter"
  echo "  3) Ohne Domain, nur zum Ausprobieren im eigenen Netzwerk"
  local choice
  read -r -p "Auswahl [1]: " choice
  DOMAIN= KLARWARG_PORT=4317 KLARWARG_NETWORK=
  case ${choice:-1} in
    1)
      KLARWARG_MODE=https
      ask_domain
      if [ "$E" = podman ] && [ "$(id -u)" != 0 ]; then
        fail "Für HTTPS braucht Podman Admin-Rechte (Ports 80 und 443). Starte mit:  sudo $0 install"
      fi
      if port_busy 80 || port_busy 443; then
        fail "Auf diesem Server benutzt schon ein anderes Programm Port 80 oder 443 — meist ein Webserver.
Dann Auswahl 2 nehmen."
      fi
      local ip
      ip=$(getent hosts "$DOMAIN" | awk '{print $1; exit}' || true)
      if [ -n "$ip" ]; then echo "Gut: $DOMAIN zeigt auf $ip — das sollte die Adresse dieses Servers sein."
      else
        echo "Achtung: $DOMAIN zeigt noch auf keinen Server. Trag beim Domain-Anbieter einen A-Eintrag"
        echo "mit der IP-Adresse dieses Servers ein. Bis das wirkt, kann es dauern — Klarwarg versucht es weiter."
      fi
      ;;
    2)
      KLARWARG_MODE=proxy
      ask_domain
      echo
      echo "Läuft dein Webserver selbst in einem Container? Dann gib den Namen seines Netzwerks ein."
      read -r -p "Netzwerk (sonst einfach Enter): " KLARWARG_NETWORK
      if [ -n "$KLARWARG_NETWORK" ]; then
        $E network inspect "$KLARWARG_NETWORK" >/dev/null 2>&1 || fail "Netzwerk „$KLARWARG_NETWORK“ gibt es nicht."
      else
        ask_port
      fi
      ;;
    3)
      KLARWARG_MODE=local
      ask_port
      ;;
    *) fail "Bitte 1, 2 oder 3 eingeben." ;;
  esac

  local origin secure trust
  if [ "$KLARWARG_MODE" = local ]; then
    local host
    host=$(hostname -I 2>/dev/null | awk '{print $1}')
    origin="http://${host:-localhost}:$KLARWARG_PORT" secure=false trust=loopback
  else
    origin="https://$DOMAIN" secure=true trust=loopback,uniquelocal
  fi

  (umask 077; cat > .env <<EOF
# Angelegt von ./klarwarg.sh install. Nach Änderungen:  ./klarwarg.sh restart
KLARWARG_MODE=$KLARWARG_MODE
DOMAIN=$DOMAIN
KLARWARG_PORT=$KLARWARG_PORT
KLARWARG_NETWORK=$KLARWARG_NETWORK
PUBLIC_ORIGIN=$origin
COOKIE_SECURE=$secure
TRUST_PROXY=$trust
EOF
  )
  load_env
  build
  say "Starte Klarwarg …"
  start_all

  say "Fertig. Klarwarg läuft."
  local code
  code=$(setup_code)
  echo
  echo "  Editor:   $(address)/admin"
  echo "  Website:  $(address)"
  if [ -n "$code" ]; then
    echo
    echo "  Einrichtungscode: $(bold "$code")"
    echo "  Öffne den Editor, gib den Code ein und wähle Benutzername und Passwort."
  else
    echo "  Vorhandene Daten übernommen — melde dich mit deinem bisherigen Zugang an."
  fi
  if [ "$KLARWARG_MODE" = proxy ]; then
    local target="127.0.0.1:$KLARWARG_PORT"
    [ -n "$KLARWARG_NETWORK" ] && target="$APP:4317"
    echo
    echo "  Noch zu tun: In deinem Webserver $DOMAIN an http://$target weiterleiten"
    echo "  (Beispiel für nginx in INSTALLATION.md)."
  fi
  if [ "$E" = podman ]; then
    echo
    echo "  Damit Klarwarg nach einem Neustart des Servers von selbst startet:"
    echo "    sudo systemctl enable podman-restart.service"
  fi
}

cmd_update() {
  load_env; use_engine
  if [ -d .git ] && command -v git >/dev/null 2>&1; then
    say "Hole die neue Version …"
    git pull --ff-only || fail "Neue Version konnte nicht geholt werden (siehe oben). Es wurde nichts verändert."
  fi
  build
  say "Sichere die Website …"
  if exists "$APP"; then $E stop "$APP" >/dev/null; fi  # bleibt bis zum Neustart aus
  backup
  say "Starte die neue Version …"
  start_all
  say "Fertig. Neue Version läuft:  $(address)"
}

cmd_status() {
  load_env; use_engine
  if running "$APP"; then echo "Klarwarg läuft:  $(address)"; else echo "Klarwarg läuft nicht. Starten:  $0 restart"; fi
  if [ "$KLARWARG_MODE" = https ]; then
    if running "$CADDY"; then echo "HTTPS (Caddy) läuft."; else echo "HTTPS (Caddy) läuft nicht."; fi
  fi
  if running "$APP"; then
    local code
    code=$(setup_code)
    [ -n "$code" ] && echo "Noch kein Adminzugang. Einrichtungscode: $code"
  fi
  return 0
}

case $CMD in
  install) cmd_install ;;
  update) cmd_update ;;
  backup) load_env; use_engine; backup ;;
  status) cmd_status ;;
  restart) load_env; use_engine; start_all; echo "Klarwarg läuft:  $(address)" ;;
  stop) load_env; use_engine; remove "$CADDY"; $E stop "$APP" >/dev/null 2>&1 || true; echo "Angehalten." ;;
  logs) load_env; use_engine; $E logs -f --tail 100 "$APP" ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
