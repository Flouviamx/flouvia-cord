#!/bin/bash
# Ignored Build Step de Vercel: exit 1 = construir, exit 0 = saltar.
# main siempre se construye; las demás ramas se saltan.
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  echo "main: se construye"
  exit 1
fi
echo "Rama $VERCEL_GIT_COMMIT_REF: se salta el build"
exit 0
