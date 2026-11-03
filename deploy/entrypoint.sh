#!/bin/sh
# Der Datenordner kommt vom Server (./data) und gehört dort oft root. Einmal dem Benutzer
# "node" geben, dann ohne Root-Rechte weiter.
set -e
mkdir -p /data
if [ "$(id -u)" = 0 ]; then
  chown -R node:node /data
  chmod 0700 /data
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
