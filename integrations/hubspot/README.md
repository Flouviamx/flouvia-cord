# App de HubSpot para Cord

Proyecto del HubSpot CLI (plataforma 2026.03). Define la app pública con OAuth y los
webhooks que usa `src/pages/api/integraciones/hubspot/`.

- `src/app/app-hsmeta.json`: nombre, scopes y URLs de regreso. Los scopes deben coincidir
  con `HUBSPOT_SCOPES` en `src/lib/integraciones/hubspot/config.ts`.
- `src/app/webhooks/webhooks-hsmeta.json`: cambios de Empresas y Contactos hacia
  `/api/integraciones/hubspot/webhook`.

## Subir cambios

```bash
hs account auth          # una vez; la llave queda en ~/.hscli/config.yml
hs project validate
hs project upload
```

El CLI ignora los archivos si la ruta del proyecto pasa por una carpeta oculta (por ejemplo
un worktree dentro de `.claude/`). En ese caso copia esta carpeta a otra ruta y sube desde ahí.

El client id y el client secret se copian de la pestaña Auth de la app en HubSpot a
`HUBSPOT_CLIENT_ID` y `HUBSPOT_CLIENT_SECRET`.
