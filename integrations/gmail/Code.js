/**
 * Cord para Gmail — abre una cotización desde el correo del cliente.
 *
 * Qué hace y qué NO hace, a propósito:
 *
 *  - Lee SOLO el correo que tienes abierto, con el permiso más estrecho que da
 *    Google para complementos (`gmail.addons.current.message.readonly`). No lee
 *    tu bandeja: ese permiso es "restringido" y obliga a una auditoría de
 *    seguridad anual de un tercero.
 *  - Se conecta con el OAuth de Cord, el mismo que usan Zapier y Make: la
 *    persona pulsa "Conectar con Cord", autoriza en la pantalla de Cord y ya.
 *    Nadie copia ni pega llaves.
 *  - Al redactar, inserta el link de una cotización del destinatario. Para eso
 *    lee solo los destinatarios del borrador, nunca su contenido.
 *  - Los tokens viven en las propiedades del USUARIO: cada persona conecta su
 *    propio espacio de Cord y nadie ve los tokens de nadie. Las credenciales
 *    del cliente OAuth viven en las propiedades del SCRIPT, que solo ve quien
 *    lo publica: nunca en este archivo ni en git.
 *  - No manda el cuerpo del correo a Cord. Del mensaje salen el remitente y el
 *    asunto, y nada más; el contenido de un correo es del negocio, no nuestro.
 */

var CORD = 'https://cordhq.app';
var REGRESO = CORD + '/oauth/listo';
var PROP_TOKENS = 'cord_oauth';
var PROP_PENDIENTE = 'cord_pendiente';
var VIDA_PENDIENTE_MS = 15 * 60 * 1000;

// ── OAuth con Cord ────────────────────────────────────────────────────────────
//
// El regreso de la autorización NO es la `usercallback` de Apps Script: Google
// la ejecuta con la cuenta que el navegador tenga primero, que no siempre es la
// del complemento, y ahí falla con "se requiere autorización". El regreso es
// una página de Cord que se queda con el código, y el complemento lo recoge
// después con el `state` que generó, su secreto y su verificador PKCE.

function credencialesCliente() {
    var p = PropertiesService.getScriptProperties();
    return { id: p.getProperty('CORD_CLIENT_ID') || '', secret: p.getProperty('CORD_CLIENT_SECRET') || '' };
}

function aleatorio() {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function leerPendiente() {
    var crudo = PropertiesService.getUserProperties().getProperty(PROP_PENDIENTE);
    if (!crudo) return null;
    try {
        var p = JSON.parse(crudo);
        return p && p.t > Date.now() - VIDA_PENDIENTE_MS ? p : null;
    } catch (err) {
        return null;
    }
}

/** Reusa la autorización en curso: Gmail repinta la tarjeta seguido y un `state` nuevo perdería el anterior. */
function pendiente() {
    var p = leerPendiente();
    if (p) return p;
    p = { state: aleatorio(), verifier: aleatorio(), t: Date.now() };
    PropertiesService.getUserProperties().setProperty(PROP_PENDIENTE, JSON.stringify(p));
    return p;
}

function urlAutorizacion() {
    var p = pendiente();
    var reto = Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.verifier, Utilities.Charset.US_ASCII),
    ).replace(/=+$/, '');
    return CORD + '/oauth/authorize'
        + '?response_type=code'
        + '&client_id=' + encodeURIComponent(credencialesCliente().id)
        + '&redirect_uri=' + encodeURIComponent(REGRESO)
        + '&scope=write'
        + '&state=' + encodeURIComponent(p.state)
        + '&code_challenge=' + encodeURIComponent(reto)
        + '&code_challenge_method=S256';
}

function leerTokens() {
    var crudo = PropertiesService.getUserProperties().getProperty(PROP_TOKENS);
    if (!crudo) return null;
    try { return JSON.parse(crudo); } catch (err) { return null; }
}

function guardarTokens(t) {
    PropertiesService.getUserProperties().setProperty(PROP_TOKENS, JSON.stringify({
        access: t.access_token,
        refresh: t.refresh_token,
        vence: Date.now() + (Number(t.expires_in) || 3600) * 1000,
    }));
}

function borrarTokens() {
    PropertiesService.getUserProperties().deleteProperty(PROP_TOKENS);
}

/** Pide tokens a Cord. Devuelve { status, tokens }; nunca lanza. */
function pedirTokens(ruta, params) {
    var c = credencialesCliente();
    params.client_id = c.id;
    params.client_secret = c.secret;
    try {
        var res = UrlFetchApp.fetch(CORD + ruta, { method: 'post', payload: params, muteHttpExceptions: true });
        var cuerpo = null;
        try { cuerpo = JSON.parse(res.getContentText()); } catch (e) { cuerpo = null; }
        if (res.getResponseCode() !== 200) {
            if (!(cuerpo && cuerpo.error === 'authorization_pending')) {
                console.error('Cord rechazó el token', ruta, res.getResponseCode(), res.getContentText().slice(0, 300));
            }
            return { status: res.getResponseCode(), error: cuerpo && cuerpo.error, tokens: null };
        }
        return { status: 200, error: null, tokens: cuerpo };
    } catch (err) {
        console.error('No se pudo pedir el token a Cord', ruta, err);
        return { status: 0, error: null, tokens: null };
    }
}

/** Si hay una autorización en curso y la persona ya aceptó en Cord, la recoge. */
function recogerAutorizacion() {
    var p = leerPendiente();
    if (!p) return false;
    var r = pedirTokens('/api/oauth/entrega', { state: p.state, code_verifier: p.verifier });
    if (r.error === 'authorization_pending') return false;
    PropertiesService.getUserProperties().deleteProperty(PROP_PENDIENTE);
    if (!r.tokens || !r.tokens.access_token) return false;
    guardarTokens(r.tokens);
    return true;
}

/**
 * Un token vigente, renovándolo si está por vencer. Cord rota el refresh token
 * en cada renovación y detecta el reuso, así que se guarda el nuevo SIEMPRE.
 */
function tokenVigente() {
    var t = leerTokens();
    if (!t) return '';
    if (t.vence > Date.now() + 60000) return t.access;
    var frescos = pedirTokens('/api/oauth/token', { grant_type: 'refresh_token', refresh_token: t.refresh }).tokens;
    if (!frescos || !frescos.access_token) {
        borrarTokens();
        return '';
    }
    guardarTokens(frescos);
    return frescos.access_token;
}

function conectado() {
    return Boolean(leerTokens()) || recogerAutorizacion();
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Llama a la API de Cord. Devuelve { ok, status, data }, nunca lanza: una tarjeta
 * de Gmail que revienta deja al vendedor sin nada que leer. El error sí queda en
 * el registro de ejecuciones del script: tragárselo sin rastro es lo que dejó
 * un "no se pudo hablar con Cord" imposible de diagnosticar.
 */
function cordFetch(ruta, opciones) {
    var token = tokenVigente();
    if (!token) return { ok: false, status: 401, data: null };
    var config = {
        method: (opciones && opciones.method) || 'get',
        headers: { Authorization: 'Bearer ' + token },
        contentType: 'application/json',
        muteHttpExceptions: true,
    };
    if (opciones && opciones.payload) config.payload = JSON.stringify(opciones.payload);
    try {
        var res = UrlFetchApp.fetch(CORD + ruta, config);
        var texto = res.getContentText();
        var cuerpo = null;
        try { cuerpo = texto ? JSON.parse(texto) : null; } catch (e) { cuerpo = null; }
        if (res.getResponseCode() >= 300) console.error('Cord respondió', res.getResponseCode(), ruta, texto.slice(0, 300));
        return { ok: res.getResponseCode() < 300, status: res.getResponseCode(), data: cuerpo };
    } catch (err) {
        console.error('No se pudo llamar a Cord', ruta, err);
        return { ok: false, status: 0, data: null };
    }
}

/** "Ana López <ana@acme.com>" → { nombre: 'Ana López', email: 'ana@acme.com' } */
/** El 429 de cuota no se arregla reintentando: se dice qué pasa. */
function mensajeDeError(r, generico) {
    if (r.status === 429 && r.data && r.data.code === 'api_quota_exceeded') {
        return 'Tu espacio de Cord ya usó las llamadas incluidas en su plan este mes. Sube de plan en Cord para seguir usando el complemento.';
    }
    return generico;
}

function partirRemitente(from) {
    var texto = String(from || '');
    var m = texto.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (m) return { nombre: m[1].trim(), email: m[2].trim().toLowerCase() };
    return { nombre: '', email: texto.trim().toLowerCase() };
}

var LOGO = CORD + '/favicon-192x192.png';
var NAVY = '#0a192f';

var ESTADOS = {
    draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', approved: 'Aprobada', rejected: 'Rechazada',
    expired: 'Vencida', paid: 'Pagada', invoiced: 'Facturada',
};

var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function encabezado(titulo, subtitulo) {
    var h = CardService.newCardHeader()
        .setTitle(titulo)
        .setImageUrl(LOGO)
        .setImageStyle(CardService.ImageStyle.SQUARE)
        .setImageAltText('Cord');
    if (subtitulo) h.setSubtitle(subtitulo);
    return h;
}

function textoSimple(valor) {
    return CardService.newTextParagraph().setText(valor);
}

function notificar(mensaje) {
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText(mensaje))
        .build();
}

function escaparHtml(texto) {
    return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** El importe viaja con su divisa: sin ella es un número, no dinero. */
function dinero(total, moneda) {
    var n = Number(total);
    if (!isFinite(n) || !moneda) return '';
    var texto;
    try {
        texto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(n);
    } catch (err) {
        texto = n.toFixed(2);
    }
    return texto.indexOf(moneda) >= 0 ? texto : texto + ' ' + moneda;
}

function fechaCorta(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1] + ' ' + m[1] : '';
}

function boton(texto, estilo) {
    return CardService.newTextButton().setText(texto).setTextButtonStyle(estilo || CardService.TextButtonStyle.TEXT);
}

function enlace(url) {
    return CardService.newOpenLink().setUrl(url);
}

// ── Tarjeta de conexión ───────────────────────────────────────────────────────

function tarjetaConectar(mensajeError) {
    var conectar = boton('Conectar con Cord', CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(NAVY)
        // Al cerrarse la ventana de Cord, Gmail vuelve a pintar el complemento
        // y `conectado()` recoge la autorización.
        .setOpenLink(enlace(urlAutorizacion())
            .setOpenAs(CardService.OpenAs.OVERLAY)
            .setOnClose(CardService.OnClose.RELOAD));

    var seccion = CardService.newCardSection()
        .addWidget(textoSimple('<b>De la propuesta al pago, desde tu correo.</b>'))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
            .setText('Mira si quien te escribe ya es tu cliente')
            .setWrapText(true))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
            .setText('Crea su cotización de un clic')
            .setWrapText(true))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
            .setText('Inserta el link de una cotización mientras escribes')
            .setWrapText(true));

    if (mensajeError) seccion.addWidget(textoSimple('<font color="#b3261e">' + escaparHtml(mensajeError) + '</font>'));

    var nota = CardService.newCardSection().addWidget(textoSimple(
        '<font color="#6b7280">Autorizas en la pantalla de Cord; no copias ninguna llave. Cord lee solo el remitente y el asunto del correo abierto.</font>',
    ));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord', 'Conecta tu espacio de trabajo'))
        .addSection(seccion)
        .addSection(nota)
        .setFixedFooter(CardService.newFixedFooter()
            .setPrimaryButton(conectar)
            .setSecondaryButton(boton('Ya autoricé')
                .setOnClickAction(CardService.newAction().setFunctionName('revisarConexion'))))
        .build();
}

function revisarConexion(e) {
    exigirPermisos();
    if (!conectado()) return notificar('Todavía no se completó la autorización en Cord.');
    var tarjeta = e && e.gmail && e.gmail.messageId ? onGmailMessage(e) : tarjetaInicio();
    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(tarjeta))
        .setNotification(CardService.newNotification().setText('Cord quedó conectado.'))
        .build();
}

function desconectar() {
    var t = leerTokens();
    // Se revoca del lado de Cord, no solo se olvida aquí: un token que solo se
    // borra localmente sigue vivo en Cord hasta que caduque.
    if (t && t.refresh) {
        var c = credencialesCliente();
        try {
            UrlFetchApp.fetch(CORD + '/api/oauth/revoke', {
                method: 'post', muteHttpExceptions: true,
                payload: { token: t.refresh, client_id: c.id, client_secret: c.secret },
            });
        } catch (err) {
            console.error('No se pudo revocar en Cord', err);
        }
    }
    borrarTokens();
    PropertiesService.getUserProperties().deleteProperty(PROP_PENDIENTE);
    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(tarjetaConectar()))
        .setNotification(CardService.newNotification().setText('Cuenta desconectada.'))
        .build();
}

/**
 * Google deja aceptar los permisos uno por uno. Si falta alguno (típicamente
 * "conectarse a un servicio externo"), esto lanza y Gmail vuelve a pedirlo, en
 * vez de que cada llamada a Cord falle en silencio.
 */
function exigirPermisos() {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
}

function expirada(mensaje) {
    borrarTokens();
    return tarjetaConectar(mensaje || 'La conexión con Cord venció o se revocó. Vuelve a conectar.');
}

function buscarCliente(email) {
    var r = cordFetch('/api/v1/clientes?email=' + encodeURIComponent(email) + '&limit=1');
    var cliente = r.ok && r.data && r.data.data && r.data.data[0] ? r.data.data[0] : null;
    return { r: r, cliente: cliente };
}

function listarCotizaciones(clienteId, limite) {
    var r = cordFetch('/api/v1/cotizaciones?limit=' + limite + (clienteId ? '&cliente_id=' + encodeURIComponent(clienteId) : ''));
    return { r: r, lista: r.ok && r.data && r.data.data ? r.data.data : [] };
}

/** Una fila de cotización: folio y estado arriba, importe al centro, cliente abajo. */
function filaCotizacion(q) {
    var arriba = q.folio + '  ·  ' + (ESTADOS[q.status] || q.status);
    var importe = dinero(q.total, q.moneda);
    return CardService.newDecoratedText()
        .setTopLabel(arriba)
        .setText('<b>' + escaparHtml(importe || q.folio) + '</b>')
        .setBottomLabel(q.cliente || '')
        .setWrapText(true);
}

// ── Inicio ────────────────────────────────────────────────────────────────────

function onHomepage() {
    exigirPermisos();
    return conectado() ? tarjetaInicio() : tarjetaConectar();
}

function tarjetaInicio() {
    var datos = listarCotizaciones(null, 5);
    if (datos.r.status === 401) return expirada();

    var seccion = CardService.newCardSection().setHeader('Cotizaciones recientes');
    if (!datos.r.ok) {
        seccion.addWidget(textoSimple(mensajeDeError(datos.r, 'No se pudieron traer tus cotizaciones.')));
    } else if (!datos.lista.length) {
        seccion.addWidget(textoSimple('Todavía no tienes cotizaciones. Abre el correo de un cliente para crear la primera.'));
    }
    datos.lista.forEach(function (q) {
        seccion.addWidget(filaCotizacion(q).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
    });

    var ayuda = CardService.newCardSection().addWidget(textoSimple(
        '<font color="#6b7280">Abre el correo de un cliente para crear su cotización, o usa Cord al redactar para insertar un link.</font>',
    ));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord', 'Conectado'))
        .addSection(seccion)
        .addSection(ayuda)
        .setFixedFooter(CardService.newFixedFooter()
            .setPrimaryButton(boton('Abrir Cord', CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOpenLink(enlace(CORD + '/app')))
            .setSecondaryButton(boton('Desconectar')
                .setOnClickAction(CardService.newAction().setFunctionName('desconectar'))))
        .build();
}

// ── Tarjeta sobre un correo ───────────────────────────────────────────────────

function onGmailMessage(e) {
    exigirPermisos();
    if (!conectado()) return tarjetaConectar();

    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var mensaje = GmailApp.getMessageById(e.gmail.messageId);
    var quien = partirRemitente(mensaje.getFrom());
    var asunto = mensaje.getSubject() || '';

    if (!quien.email) {
        return CardService.newCardBuilder()
            .setHeader(encabezado('Cord'))
            .addSection(CardService.newCardSection().addWidget(
                textoSimple('Este correo no trae una dirección de remitente que Cord pueda usar.'),
            ))
            .build();
    }

    var b = buscarCliente(quien.email);
    if (b.r.status === 401) return expirada();
    if (!b.r.ok) {
        return CardService.newCardBuilder()
            .setHeader(encabezado('Cord'))
            .addSection(CardService.newCardSection().addWidget(
                textoSimple(mensajeDeError(b.r, 'No se pudo consultar Cord. Inténtalo otra vez.')),
            ))
            .build();
    }
    var cliente = b.cliente;

    var persona = CardService.newCardSection()
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
            .setTopLabel(cliente ? 'Cliente en Cord' : 'Todavía no es tu cliente')
            .setText('<b>' + escaparHtml(cliente ? (cliente.empresa || quien.email) : (quien.nombre || quien.email)) + '</b>')
            .setBottomLabel(quien.email)
            .setWrapText(true));
    if (cliente) {
        persona.addWidget(boton('Ver cliente en Cord').setOpenLink(enlace(CORD + '/app/clientes/' + cliente.id)));
    }

    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado('Cord', asunto ? asunto.slice(0, 80) : 'Correo abierto'))
        .addSection(persona);

    if (cliente) {
        var datos = listarCotizaciones(cliente.id, 3);
        var historial = CardService.newCardSection().setHeader('Sus cotizaciones');
        if (!datos.lista.length) historial.addWidget(textoSimple('<font color="#6b7280">Todavía no tiene cotizaciones.</font>'));
        datos.lista.forEach(function (q) {
            historial.addWidget(filaCotizacion(q).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
        });
        tarjeta.addSection(historial);
    } else {
        tarjeta.addSection(CardService.newCardSection().addWidget(textoSimple(
            '<font color="#6b7280">Al crear la cotización, Cord lo da de alta con su nombre y correo.</font>',
        )));
    }

    return tarjeta
        .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(
            boton(cliente ? 'Crear cotización' : 'Crear cliente y cotización', CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOnClickAction(CardService.newAction()
                    .setFunctionName('crearCotizacion')
                    .setParameters({
                        email: quien.email,
                        nombre: quien.nombre || '',
                        asunto: asunto,
                        clienteId: cliente ? String(cliente.id) : '',
                    }))))
        .build();
}

// ── Crear ─────────────────────────────────────────────────────────────────────

function crearCotizacion(e) {
    var p = e.parameters || {};
    var clienteId = p.clienteId;

    if (!clienteId) {
        // El nombre del remitente es lo único que Gmail da para nombrar a la
        // empresa; si no viene, se usa el correo en vez de inventar un nombre.
        var alta = cordFetch('/api/v1/clientes', {
            method: 'post',
            payload: { empresa: p.nombre || p.email, contacto: p.nombre || '', email: p.email },
        });
        if (!alta.ok || !alta.data || !alta.data.data) {
            return notificar(alta.status === 402
                ? 'Tu plan de Cord ya no admite más clientes.'
                : mensajeDeError(alta, 'No se pudo crear el cliente en Cord.'));
        }
        clienteId = String(alta.data.data.id);
    }

    // La cotización nace con una línea a partir del asunto: Cord exige al menos
    // una, y un asunto describe el trabajo mejor que un renglón vacío. El
    // vendedor la ajusta en Cord, que es donde están los productos y los precios.
    var cotizacion = cordFetch('/api/v1/cotizaciones', {
        method: 'post',
        payload: {
            cliente_id: clienteId,
            items: [{ descripcion: (p.asunto || 'Concepto por definir').slice(0, 200), cantidad: 1, precio_unitario: 0 }],
        },
    });
    if (!cotizacion.ok || !cotizacion.data || !cotizacion.data.data) {
        return notificar(mensajeDeError(cotizacion, 'No se pudo crear la cotización en Cord.'));
    }

    var datos = cotizacion.data.data;
    var url = CORD + '/app/cotizaciones/' + datos.id;
    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado('Cotización creada', datos.folio || ''))
        .addSection(CardService.newCardSection()
            .addWidget(CardService.newDecoratedText()
                .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
                .setTopLabel('Borrador')
                .setText('<b>' + escaparHtml(datos.folio || 'Cotización') + '</b>')
                .setBottomLabel(p.nombre || p.email || '')
                .setWrapText(true))
            .addWidget(textoSimple('<font color="#6b7280">Agrega los productos y el precio en Cord, y envíala desde ahí.</font>')))
        .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(
            boton('Terminar en Cord', CardService.TextButtonStyle.FILLED).setBackgroundColor(NAVY).setOpenLink(enlace(url))))
        .build();

    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(tarjeta))
        .setNotification(CardService.newNotification().setText('Cotización ' + (datos.folio || '') + ' creada.'))
        .build();
}

// ── Al redactar ───────────────────────────────────────────────────────────────

function onGmailCompose(e) {
    exigirPermisos();
    if (!conectado()) return [tarjetaConectar()];

    var para = (e.draftMetadata && e.draftMetadata.toRecipients) || [];
    var email = para.length ? partirRemitente(para[0]).email : '';
    var cliente = null;
    if (email) {
        var b = buscarCliente(email);
        if (b.r.status === 401) return [expirada()];
        cliente = b.cliente;
    }

    var datos = listarCotizaciones(cliente ? cliente.id : null, 25);
    if (datos.r.status === 401) return [expirada()];
    // Un borrador todavía no tiene una página que el cliente pueda abrir.
    var cotizaciones = datos.lista
        .filter(function (q) { return q.status !== 'draft' && q.link_publico; })
        .slice(0, 10);

    var seccion = CardService.newCardSection();
    if (!datos.r.ok) {
        seccion.addWidget(textoSimple(mensajeDeError(datos.r, 'No se pudieron traer tus cotizaciones de Cord. Inténtalo otra vez.')));
    } else if (!cotizaciones.length) {
        seccion.addWidget(textoSimple(cliente
            ? 'Este cliente todavía no tiene cotizaciones enviadas.'
            : 'Todavía no tienes cotizaciones enviadas.'));
    }

    cotizaciones.forEach(function (q, i) {
        if (i > 0) seccion.addWidget(CardService.newDivider());
        seccion.addWidget(filaCotizacion(q)
            .setButton(boton('Insertar', CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOnClickAction(CardService.newAction()
                    .setFunctionName('insertarCotizacion')
                    .setParameters({
                        link: q.link_publico,
                        folio: q.folio || '',
                        cliente: q.cliente || '',
                        importe: dinero(q.total, q.moneda),
                        vigencia: fechaCorta(q.vigencia),
                    }))));
    });

    var subtitulo = cliente ? 'Para ' + (cliente.empresa || email) : 'Tus cotizaciones enviadas';
    return [CardService.newCardBuilder()
        .setHeader(encabezado('Insertar cotización', subtitulo))
        .addSection(seccion)
        .build()];
}

/**
 * Inserta una tarjeta de la cotización, no un link suelto. Es HTML de correo:
 * tablas y estilos en línea, porque los clientes de correo ignoran el CSS externo.
 */
function insertarCotizacion(e) {
    var p = e.parameters || {};
    if (!/^https:\/\//.test(p.link || '')) return notificar('Esa cotización no tiene un link válido.');
    var link = escaparHtml(p.link);
    var detalle = [p.cliente, p.vigencia ? 'Vigente hasta el ' + p.vigencia : ''].filter(Boolean).map(escaparHtml).join(' &middot; ');
    var html = ''
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e5e7eb;border-radius:16px;max-width:460px;width:100%;margin:12px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">'
        + '<tr><td style="padding:22px 24px">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8a93a3">Cotización ' + escaparHtml(p.folio) + '</div>'
        + (p.importe ? '<div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#050505;margin:8px 0 4px">' + escaparHtml(p.importe) + '</div>' : '')
        + (detalle ? '<div style="font-size:13px;line-height:1.5;color:#5b6472">' + detalle + '</div>' : '')
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr>'
        + '<td style="border-radius:999px;background:#0a192f"><a href="' + link + '" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">Ver cotización</a></td>'
        + '</tr></table>'
        + '</td></tr></table><br>';
    return CardService.newUpdateDraftActionResponseBuilder()
        .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
            .addUpdateContent(html, CardService.ContentType.MUTABLE_HTML)
            .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
        .build();
}
