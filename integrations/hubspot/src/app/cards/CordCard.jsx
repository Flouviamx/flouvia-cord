import React, { useEffect, useState } from "react";
import { hubspot, Alert, Button, Divider, EmptyState, Flex, Link, LoadingSpinner, Tag, Text } from "@hubspot/ui-extensions";

// La tarjeta solo lee: Cord firma la respuesta con la organización del portal y
// crear abre Cord con la sesión de la persona, nunca escribe desde HubSpot.
const API = "https://cordhq.app/api/integraciones/hubspot/tarjeta";
const TIPOS = { "0-1": "contact", "0-2": "company", "0-3": "deal" };
const TONO = { success: "success", warning: "warning", danger: "error", default: "default" };

const TEXTOS = {
  es: {
    cargando: "Cargando Cord…",
    error_titulo: "Cord no respondió",
    error: "No se pudieron traer las cotizaciones. Recarga el registro en un momento.",
    sin_conexion: "Esta cuenta de HubSpot no está conectada a Cord. Conéctala desde Ajustes › Integraciones › HubSpot.",
    abrir_ajustes: "Abrir Cord",
    sin_vinculo: "Este registro todavía no está ligado a un cliente de Cord. Se liga solo cuando el cliente o su cotización se sincronizan.",
    sin_cotizaciones: "Este cliente todavía no tiene cotizaciones.",
    cliente: "Cliente en Cord",
    resumen: (a, g) => `${a} en juego · ${g} ganadas`,
    link_cliente: "Link del cliente",
    crear: "Crear cotización en Cord",
  },
  en: {
    cargando: "Loading Cord…",
    error_titulo: "Cord did not respond",
    error: "The quotes could not be loaded. Reload the record in a moment.",
    sin_conexion: "This HubSpot account is not connected to Cord. Connect it from Settings › Integrations › HubSpot.",
    abrir_ajustes: "Open Cord",
    sin_vinculo: "This record is not linked to a Cord client yet. It links on its own once the client or its quote syncs.",
    sin_cotizaciones: "This client has no quotes yet.",
    cliente: "Client in Cord",
    resumen: (a, g) => `${a} in play · ${g} won`,
    link_cliente: "Client link",
    crear: "Create quote in Cord",
  },
};

hubspot.extend(({ context }) => <CordCard context={context} />);

const CordCard = ({ context }) => {
  const lang = String(context?.user?.locale || "es").toLowerCase().startsWith("es") ? "es" : "en";
  const t = TEXTOS[lang];
  const objeto = TIPOS[context?.crm?.objectTypeId];
  const [estado, setEstado] = useState({ cargando: true });

  useEffect(() => {
    if (!objeto) {
      setEstado({ error: true });
      return;
    }
    const url = `${API}?objeto=${objeto}&id=${encodeURIComponent(context.crm.objectId)}&lang=${lang}`;
    hubspot
      .fetch(url, { timeout: 15000 })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setEstado({ data }))
      .catch(() => setEstado({ error: true }));
  }, []);

  if (estado.cargando) return <LoadingSpinner label={t.cargando} />;
  if (estado.error) return <Alert title={t.error_titulo} variant="error">{t.error}</Alert>;

  const data = estado.data;
  if (!data.conectado) {
    return (
      <Flex direction="column" gap="small">
        <Text>{t.sin_conexion}</Text>
        <Link href={{ url: "https://cordhq.app/app/ajustes/integraciones/hubspot", external: true }}>{t.abrir_ajustes}</Link>
      </Flex>
    );
  }
  if (!data.cliente && !data.cotizaciones.length) {
    return <EmptyState title="Cord" layout="vertical"><Text>{t.sin_vinculo}</Text></EmptyState>;
  }

  return (
    <Flex direction="column" gap="small">
      {data.cliente && (
        <Flex direction="column" gap="flush">
          <Text variant="microcopy">{t.cliente}</Text>
          <Link href={{ url: data.cliente.abrir, external: true }}>{data.cliente.nombre}</Link>
          <Text variant="microcopy">{t.resumen(data.resumen.abiertas, data.resumen.ganadas)}</Text>
        </Flex>
      )}

      {data.cotizaciones.length === 0 && <Text>{t.sin_cotizaciones}</Text>}

      {data.cotizaciones.map((q) => (
        <Flex key={q.folio} direction="column" gap="flush">
          <Divider />
          <Flex direction="row" justify="between" align="center">
            <Link href={{ url: q.abrir, external: true }}>{q.folio}</Link>
            <Tag variant={TONO[q.tono] || "default"}>{q.estado}</Tag>
          </Flex>
          <Text format={{ fontWeight: "bold" }}>{q.importe}</Text>
          <Flex direction="row" justify="between">
            <Text variant="microcopy">{q.creada}</Text>
            {q.link && <Link href={{ url: q.link, external: true }}>{t.link_cliente}</Link>}
          </Flex>
        </Flex>
      ))}

      {data.crear && (
        <Flex direction="column">
          <Divider />
          <Button variant="primary" href={{ url: data.crear, external: true }}>{t.crear}</Button>
        </Flex>
      )}
    </Flex>
  );
};
