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
 *  - Del correo salen el remitente, el asunto y el folio de una cotización si
 *    lo trae. El texto solo viaja a Cord cuando la persona pulsa "Cotizar con
 *    IA", y la tarjeta lo dice: el contenido de un correo es del negocio.
 */

var CORD = 'https://cordhq.app';
var REGRESO = CORD + '/oauth/listo';
var PROP_TOKENS = 'cord_oauth';
var PROP_PENDIENTE = 'cord_pendiente';
var VIDA_PENDIENTE_MS = 15 * 60 * 1000;

// ── Idioma ────────────────────────────────────────────────────────────────────
//
// El de Gmail de quien usa el complemento (`useLocaleFromApp`). Cord habla
// español e inglés; cualquier otro idioma cae a inglés, que se lee en más
// mercados que el español.

var IDIOMA = 'es';

var EN = {
    "  ·  fuera de tu catálogo": "  ·  not in your catalog",
    " línea propuesta": " proposed line",
    " líneas propuestas": " proposed lines",
    "<b>De la propuesta al pago, desde tu correo.</b>": "<b>From proposal to payment, from your inbox.</b>",
    "<font color=\"#6b7280\">Abre el correo de un cliente para crear su cotización, o usa Cord al redactar para insertar un link.</font>": "<font color=\"#6b7280\">Open a client's email to create their quote, or use Cord while composing to insert one.</font>",
    "<font color=\"#6b7280\">Agrega los productos y el precio en Cord, y envíala desde ahí.</font>": "<font color=\"#6b7280\">Add the products and price in Cord, and send it from there.</font>",
    "<font color=\"#6b7280\">Al crear la cotización, Cord lo da de alta con su nombre y correo.</font>": "<font color=\"#6b7280\">When you create the quote, Cord adds them with their name and email.</font>",
    "<font color=\"#6b7280\">Autorizas en la pantalla de Cord; no copias ninguna llave. Del correo abierto, Cord usa el remitente y el asunto; el texto solo cuando pides cotizar con IA.</font>": "<font color=\"#6b7280\">You authorize on the Cord screen; no keys to copy. From the open email, Cord uses the sender and subject; the text only when you ask to quote with AI.</font>",
    "<font color=\"#6b7280\">Cord leyó el texto de este correo para proponerla. Revisa las líneas: se crea como borrador y la terminas en Cord.</font>": "<font color=\"#6b7280\">Cord read this email's text to propose it. Review the lines: it is created as a draft and you finish it in Cord.</font>",
    "<p>Hola, te comparto la cotización ": "<p>Hi, here is quote ",
    "Abrir Cord": "Open Cord",
    "Cliente en Cord": "Client in Cord",
    "Concepto por definir": "Item to be defined",
    "Conecta tu espacio de trabajo": "Connect your workspace",
    "Conectar con Cord": "Connect with Cord",
    "Cord le volvió a mandar la cotización ": "Cord resent quote ",
    "Cord quedó conectado.": "Cord is connected.",
    "Correo abierto": "Open email",
    "Cotizaciones recientes": "Recent quotes",
    "Cotización": "Quote",
    "Cotización ": "Quote ",
    "Cotización creada": "Quote created",
    "Cotización en blanco": "Blank quote",
    "Cotización en este hilo": "Quote in this thread",
    "Cotización propuesta": "Proposed quote",
    "Cotizar con IA": "Quote with AI",
    "Crea su cotización de un clic": "Create their quote in one click",
    "Crear cliente y cotización": "Create client and quote",
    "Crear cotización": "Create quote",
    "Cuenta desconectada.": "Account disconnected.",
    "Esa cotización no tiene un link válido.": "That quote does not have a valid link.",
    "Esa cotización todavía no tiene link: envíala primero desde Cord.": "That quote has no link yet: send it from Cord first.",
    "Este cliente todavía no tiene cotizaciones enviadas.": "This client has no sent quotes yet.",
    "Este correo no trae texto que Cord pueda leer.": "This email has no text Cord can read.",
    "Este correo no trae una dirección de remitente que Cord pueda usar.": "This email has no sender address Cord can use.",
    "Inserta el link de una cotización mientras escribes": "Insert a quote while you write",
    "Insertar cotización": "Insert quote",
    "La IA no encontró productos en este correo. Crea la cotización en blanco.": "The AI found no products in this email. Create a blank quote.",
    "La IA no pudo leer el pedido. Inténtalo otra vez.": "The AI could not read the order. Try again.",
    "La conexión con Cord venció o se revocó. Vuelve a conectar.": "The connection with Cord expired or was revoked. Connect again.",
    "Mira si quien te escribe ya es tu cliente": "See whether the sender is already your client",
    "No se pudieron traer tus cotizaciones de Cord. Inténtalo otra vez.": "Your Cord quotes could not be loaded. Try again.",
    "No se pudieron traer tus cotizaciones.": "Your quotes could not be loaded.",
    "No se pudo consultar Cord. Inténtalo otra vez.": "Cord could not be reached. Try again.",
    "No se pudo crear el cliente en Cord.": "The client could not be created in Cord.",
    "No se pudo crear la cotización en Cord.": "The quote could not be created in Cord.",
    "No se pudo reenviar la cotización.": "The quote could not be resent.",
    "No tiene otras cotizaciones.": "No other quotes.",
    "Para ": "For ",
    "Reenviar por Cord": "Resend via Cord",
    "Responder con ella": "Reply with it",
    "Sin precio: lo pones en Cord": "No price: set it in Cord",
    "Sus cotizaciones": "Their quotes",
    "Te comparto la cotización ": "Here is quote ",
    "Terminar en Cord": "Finish in Cord",
    "Todavía no es tu cliente": "Not your client yet",
    "Todavía no se completó la autorización en Cord.": "Authorization in Cord is not complete yet.",
    "Todavía no tiene cotizaciones.": "No quotes yet.",
    "Todavía no tienes cotizaciones enviadas.": "You have no sent quotes yet.",
    "Todavía no tienes cotizaciones. Abre el correo de un cliente para crear la primera.": "You have no quotes yet. Open a client's email to create the first one.",
    "Tu espacio de Cord ya usó las llamadas incluidas en su plan este mes. Sube de plan en Cord para seguir usando el complemento.": "Your Cord workspace used the calls included in its plan this month. Upgrade in Cord to keep using the add-on.",
    "Tu plan de Cord ya no admite más clientes.": "Your Cord plan does not allow more clients.",
    "Tu plan de Cord ya usó sus cotizaciones con IA de este mes.": "Your Cord plan used its AI quotes for this month.",
    "Tus cotizaciones enviadas": "Your sent quotes",
    "Ver cliente en Cord": "View client in Cord",
    "Vigente hasta el ": "Valid until ",
    "Ya autoricé": "I already authorized",
    "Última actividad": "Latest activity",
    "Conectado": "Connected",
    "Desconectar": "Disconnect",
    "Abrir": "Open",
    "Insertar": "Insert",
    "Borrador": "Draft",
    "pieza": "piece",
    " c/u": " each",
    "Ver cotización": "View quote",
    " creada.": " created."
};

function fijarIdioma(e) {
    var locale = (e && e.commonEventObject && e.commonEventObject.userLocale) || '';
    IDIOMA = !locale || /^es/i.test(locale) ? 'es' : 'en';
}

/** El texto en el idioma de quien usa el complemento. La llave es el texto en español. */
function T(texto) {
    return IDIOMA === 'en' && EN[texto] !== undefined ? EN[texto] : texto;
}

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
        return T('Tu espacio de Cord ya usó las llamadas incluidas en su plan este mes. Sube de plan en Cord para seguir usando el complemento.');
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
    es: {
        draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', approved: 'Aprobada', rejected: 'Rechazada',
        expired: 'Vencida', paid: 'Pagada', invoiced: 'Facturada',
    },
    en: {
        draft: 'Draft', sent: 'Sent', viewed: 'Viewed', approved: 'Approved', rejected: 'Rejected',
        expired: 'Expired', paid: 'Paid', invoiced: 'Invoiced',
    },
};

var MESES = {
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

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
        texto = new Intl.NumberFormat(IDIOMA === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: moneda }).format(n);
    } catch (err) {
        texto = n.toFixed(2);
    }
    return texto.indexOf(moneda) >= 0 ? texto : texto + ' ' + moneda;
}

function fechaCorta(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Number(m[3]) + ' ' + MESES[IDIOMA][Number(m[2]) - 1] + ' ' + m[1] : '';
}

function boton(texto, estilo) {
    return CardService.newTextButton().setText(texto).setTextButtonStyle(estilo || CardService.TextButtonStyle.TEXT);
}

function enlace(url) {
    return CardService.newOpenLink().setUrl(url);
}

// ── Tarjeta de conexión ───────────────────────────────────────────────────────

function tarjetaConectar(mensajeError) {
    var conectar = boton(T('Conectar con Cord'), CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(NAVY)
        // Al cerrarse la ventana de Cord, Gmail vuelve a pintar el complemento
        // y `conectado()` recoge la autorización.
        .setOpenLink(enlace(urlAutorizacion())
            .setOpenAs(CardService.OpenAs.OVERLAY)
            .setOnClose(CardService.OnClose.RELOAD));

    var seccion = CardService.newCardSection()
        .addWidget(textoSimple(T('<b>De la propuesta al pago, desde tu correo.</b>')))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
            .setText(T('Mira si quien te escribe ya es tu cliente'))
            .setWrapText(true))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
            .setText(T('Crea su cotización de un clic'))
            .setWrapText(true))
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
            .setText(T('Inserta el link de una cotización mientras escribes'))
            .setWrapText(true));

    if (mensajeError) seccion.addWidget(textoSimple('<font color="#b3261e">' + escaparHtml(mensajeError) + '</font>'));

    var nota = CardService.newCardSection().addWidget(textoSimple(
        T('<font color="#6b7280">Autorizas en la pantalla de Cord; no copias ninguna llave. Del correo abierto, Cord usa el remitente y el asunto; el texto solo cuando pides cotizar con IA.</font>'),
    ));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord', T('Conecta tu espacio de trabajo')))
        .addSection(seccion)
        .addSection(nota)
        .setFixedFooter(CardService.newFixedFooter()
            .setPrimaryButton(conectar)
            .setSecondaryButton(boton(T('Ya autoricé'))
                .setOnClickAction(CardService.newAction().setFunctionName('revisarConexion'))))
        .build();
}

function revisarConexion(e) {
    exigirPermisos(e);
    if (!conectado()) return notificar(T('Todavía no se completó la autorización en Cord.'));
    var tarjeta = e && e.gmail && e.gmail.messageId ? onGmailMessage(e) : tarjetaInicio();
    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(tarjeta))
        .setNotification(CardService.newNotification().setText(T('Cord quedó conectado.')))
        .build();
}

function desconectar(e) {
    fijarIdioma(e);
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
        .setNotification(CardService.newNotification().setText(T('Cuenta desconectada.')))
        .build();
}

/**
 * Google deja aceptar los permisos uno por uno. Si falta alguno (típicamente
 * "conectarse a un servicio externo"), esto lanza y Gmail vuelve a pedirlo, en
 * vez de que cada llamada a Cord falle en silencio.
 */
function exigirPermisos(e) {
    fijarIdioma(e);
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
}

function expirada(mensaje) {
    borrarTokens();
    return tarjetaConectar(mensaje || T('La conexión con Cord venció o se revocó. Vuelve a conectar.'));
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
    var arriba = q.folio + '  ·  ' + (ESTADOS[IDIOMA][q.status] || q.status);
    var importe = dinero(q.total, q.moneda);
    return CardService.newDecoratedText()
        .setTopLabel(arriba)
        .setText('<b>' + escaparHtml(importe || q.folio) + '</b>')
        .setBottomLabel(q.cliente || '')
        .setWrapText(true);
}

// ── Inicio ────────────────────────────────────────────────────────────────────

function onHomepage(e) {
    exigirPermisos(e);
    return conectado() ? tarjetaInicio() : tarjetaConectar();
}

function tarjetaInicio() {
    var datos = listarCotizaciones(null, 5);
    if (datos.r.status === 401) return expirada();

    var seccion = CardService.newCardSection().setHeader(T('Cotizaciones recientes'));
    if (!datos.r.ok) {
        seccion.addWidget(textoSimple(mensajeDeError(datos.r, T('No se pudieron traer tus cotizaciones.'))));
    } else if (!datos.lista.length) {
        seccion.addWidget(textoSimple(T('Todavía no tienes cotizaciones. Abre el correo de un cliente para crear la primera.')));
    }
    datos.lista.forEach(function (q) {
        seccion.addWidget(filaCotizacion(q).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
    });

    var ayuda = CardService.newCardSection().addWidget(textoSimple(
        T('<font color="#6b7280">Abre el correo de un cliente para crear su cotización, o usa Cord al redactar para insertar un link.</font>'),
    ));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord', T('Conectado')))
        .addSection(seccion)
        .addSection(ayuda)
        .setFixedFooter(CardService.newFixedFooter()
            .setPrimaryButton(boton(T('Abrir Cord'), CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOpenLink(enlace(CORD + '/app')))
            .setSecondaryButton(boton(T('Desconectar'))
                .setOnClickAction(CardService.newAction().setFunctionName('desconectar'))))
        .build();
}

// ── Tarjeta sobre un correo ───────────────────────────────────────────────────

/** Folios del asunto y del inicio del cuerpo: "Re: Cotización COT-0006 — Flouvia". */
function foliosDelCorreo(asunto, cuerpo) {
    var texto = asunto + '\n' + String(cuerpo || '').slice(0, 4000);
    var vistos = {};
    var out = [];
    var re = /\b([A-Z]{2,6}-\d{3,8})\b/g;
    var m;
    while ((m = re.exec(texto)) && out.length < 3) {
        if (!vistos[m[1]]) { vistos[m[1]] = true; out.push(m[1]); }
    }
    return out;
}

function cotizacionDelHilo(folios) {
    for (var i = 0; i < folios.length; i++) {
        var r = cordFetch('/api/v1/cotizaciones?limit=1&folio=' + encodeURIComponent(folios[i]));
        var q = r.ok && r.data && r.data.data && r.data.data[0];
        if (!q) continue;
        var detalle = cordFetch('/api/v1/cotizaciones/' + encodeURIComponent(q.id));
        return detalle.ok && detalle.data && detalle.data.data ? detalle.data.data : q;
    }
    return null;
}

/** Lo último que pasó con la cotización, del historial de Cord. */
function ultimaActividad(q) {
    var eventos = Array.isArray(q.eventos) ? q.eventos : [];
    var e = eventos[0];
    return e ? e.detalle + (e.cuando ? ' · ' + e.cuando : '') : '';
}

function seccionCotizacionDelHilo(q) {
    var seccion = CardService.newCardSection().setHeader(T('Cotización en este hilo'));
    seccion.addWidget(filaCotizacion(q).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
    var actividad = ultimaActividad(q);
    if (actividad) {
        seccion.addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK))
            .setTopLabel(T('Última actividad'))
            .setText(escaparHtml(actividad))
            .setWrapText(true));
    }
    var botones = CardService.newButtonSet();
    if (q.link_publico && q.status !== 'draft') {
        botones.addButton(boton(T('Responder con ella'))
            .setOnClickAction(CardService.newAction()
                .setFunctionName('responderConCotizacion')
                .setParameters(parametrosTarjeta(q))));
        if (['sent', 'viewed'].indexOf(q.status) >= 0) {
            botones.addButton(boton(T('Reenviar por Cord'))
                .setOnClickAction(CardService.newAction()
                    .setFunctionName('reenviarPorCord')
                    .setParameters({ id: String(q.id), folio: q.folio || '' })));
        }
    }
    botones.addButton(boton(T('Abrir')).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
    seccion.addWidget(botones);
    return seccion;
}

function onGmailMessage(e) {
    exigirPermisos(e);
    if (!conectado()) return tarjetaConectar();

    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var mensaje = GmailApp.getMessageById(e.gmail.messageId);
    var quien = partirRemitente(mensaje.getFrom());
    var asunto = mensaje.getSubject() || '';

    if (!quien.email) {
        return CardService.newCardBuilder()
            .setHeader(encabezado('Cord'))
            .addSection(CardService.newCardSection().addWidget(
                textoSimple(T('Este correo no trae una dirección de remitente que Cord pueda usar.')),
            ))
            .build();
    }

    var b = buscarCliente(quien.email);
    if (b.r.status === 401) return expirada();
    if (!b.r.ok) {
        return CardService.newCardBuilder()
            .setHeader(encabezado('Cord'))
            .addSection(CardService.newCardSection().addWidget(
                textoSimple(mensajeDeError(b.r, T('No se pudo consultar Cord. Inténtalo otra vez.'))),
            ))
            .build();
    }
    var cliente = b.cliente;

    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado('Cord', asunto ? asunto.slice(0, 80) : T('Correo abierto')));

    // El folio se busca en el asunto y el arranque del cuerpo del correo abierto,
    // que es lo que el permiso deja leer. No se manda a Cord nada más que el folio.
    var enHilo = cotizacionDelHilo(foliosDelCorreo(asunto, mensaje.getPlainBody()));
    if (enHilo) tarjeta.addSection(seccionCotizacionDelHilo(enHilo));

    var persona = CardService.newCardSection()
        .addWidget(CardService.newDecoratedText()
            .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
            .setTopLabel(cliente ? T('Cliente en Cord') : T('Todavía no es tu cliente'))
            .setText('<b>' + escaparHtml(cliente ? (cliente.empresa || quien.email) : (quien.nombre || quien.email)) + '</b>')
            .setBottomLabel(quien.email)
            .setWrapText(true));
    if (cliente) {
        persona.addWidget(boton(T('Ver cliente en Cord')).setOpenLink(enlace(CORD + '/app/clientes/' + cliente.id)));
    }
    tarjeta.addSection(persona);

    if (cliente) {
        var datos = listarCotizaciones(cliente.id, 4);
        var otras = datos.lista.filter(function (q) { return !enHilo || q.id !== enHilo.id; }).slice(0, 3);
        var historial = CardService.newCardSection().setHeader(T('Sus cotizaciones'));
        if (!otras.length) historial.addWidget(textoSimple('<font color="#6b7280">' + (enHilo ? T('No tiene otras cotizaciones.') : T('Todavía no tiene cotizaciones.')) + '</font>'));
        otras.forEach(function (q) {
            historial.addWidget(filaCotizacion(q).setOpenLink(enlace(CORD + '/app/cotizaciones/' + q.id)));
        });
        tarjeta.addSection(historial);
    } else {
        tarjeta.addSection(CardService.newCardSection().addWidget(textoSimple(
            T('<font color="#6b7280">Al crear la cotización, Cord lo da de alta con su nombre y correo.</font>'),
        )));
    }

    var params = {
        email: quien.email,
        nombre: quien.nombre || '',
        asunto: asunto,
        clienteId: cliente ? String(cliente.id) : '',
    };
    return tarjeta
        .setFixedFooter(CardService.newFixedFooter()
            .setPrimaryButton(boton(T('Cotizar con IA'), CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOnClickAction(CardService.newAction().setFunctionName('cotizarConIa').setParameters(params)))
            .setSecondaryButton(boton(cliente ? T('Cotización en blanco') : T('Crear cliente y cotización'))
                .setOnClickAction(CardService.newAction().setFunctionName('crearCotizacion').setParameters(params))))
        .build();
}

// ── Cotizar con IA ────────────────────────────────────────────────────────────

/**
 * El pedido del correo sin lo citado: las respuestas arrastran el hilo entero
 * debajo, y la IA no debe cotizar lo que se pidió hace tres correos.
 */
function textoDelPedido(cuerpo) {
    var lineas = String(cuerpo || '').split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lineas.length; i++) {
        var l = lineas[i];
        if (/^\s*>/.test(l)) continue;
        if (/^(El|On)\s.+(escribió|wrote):\s*$/.test(l.trim())) break;
        if (/^-{2,}\s*(Mensaje original|Original Message)/i.test(l.trim())) break;
        out.push(l);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

/**
 * Es el ÚNICO camino que manda el texto de un correo a Cord, y solo cuando la
 * persona pulsa el botón. La tarjeta lo dice.
 */
function cotizarConIa(e) {
    fijarIdioma(e);
    var p = e.parameters || {};
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var mensaje = GmailApp.getMessageById(e.gmail.messageId);
    var texto = textoDelPedido(mensaje.getPlainBody());
    if (!texto) texto = p.asunto || '';
    if (!texto) return notificar(T('Este correo no trae texto que Cord pueda leer.'));

    var r = cordFetch('/api/v1/cotizaciones/ia', { method: 'post', payload: { texto: (p.asunto ? 'Asunto: ' + p.asunto + '\n\n' : '') + texto } });
    if (r.status === 401) return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(expirada())).build();
    if (!r.ok || !r.data || !r.data.data) {
        var codigo = r.data && r.data.code;
        return notificar(codigo === 'ai_quota_exceeded'
            ? T('Tu plan de Cord ya usó sus cotizaciones con IA de este mes.')
            : codigo === 'no_items'
                ? T('La IA no encontró productos en este correo. Crea la cotización en blanco.')
                : (IDIOMA === 'es' && r.data && r.data.error) || T('La IA no pudo leer el pedido. Inténtalo otra vez.'));
    }

    var items = (r.data.data.items || []).slice(0, 40);
    var moneda = r.data.data.moneda;
    var seccion = CardService.newCardSection().setHeader(items.length + (items.length === 1 ? T(' línea propuesta') : T(' líneas propuestas')));
    items.forEach(function (it, i) {
        if (i > 0) seccion.addWidget(CardService.newDivider());
        var precio = it.negociado || it.lista;
        seccion.addWidget(CardService.newDecoratedText()
            .setTopLabel(it.cantidad + ' ' + (it.unidad || T('pieza')) + (it.id ? '' : T('  ·  fuera de tu catálogo')))
            .setText('<b>' + escaparHtml(it.nombre) + '</b>')
            .setBottomLabel(precio > 0 ? dinero(precio, moneda) + T(' c/u') : T('Sin precio: lo pones en Cord'))
            .setWrapText(true));
    });

    var compacto = JSON.stringify(items.map(function (it) {
        return { p: it.id || '', d: it.nombre, c: it.cantidad, u: it.lista || 0, n: it.negociado || null };
    }));
    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado(T('Cotización propuesta'), p.nombre || p.email))
        .addSection(seccion)
        .addSection(CardService.newCardSection().addWidget(textoSimple(
            T('<font color="#6b7280">Cord leyó el texto de este correo para proponerla. Revisa las líneas: se crea como borrador y la terminas en Cord.</font>'),
        )))
        .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(
            boton(T('Crear cotización'), CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOnClickAction(CardService.newAction().setFunctionName('crearCotizacion').setParameters({
                    email: p.email || '', nombre: p.nombre || '', asunto: p.asunto || '', clienteId: p.clienteId || '', items: compacto,
                }))))
        .build();

    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(tarjeta))
        .build();
}

// ── Crear ─────────────────────────────────────────────────────────────────────

function crearCotizacion(e) {
    fijarIdioma(e);
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
                ? T('Tu plan de Cord ya no admite más clientes.')
                : mensajeDeError(alta, T('No se pudo crear el cliente en Cord.')));
        }
        clienteId = String(alta.data.data.id);
    }

    // La cotización nace con una línea a partir del asunto: Cord exige al menos
    // una, y un asunto describe el trabajo mejor que un renglón vacío. El
    // vendedor la ajusta en Cord, que es donde están los productos y los precios.
    var lineas = [{ descripcion: (p.asunto || T('Concepto por definir')).slice(0, 200), cantidad: 1, precio_unitario: 0 }];
    if (p.items) {
        try {
            var propuestas = JSON.parse(p.items).map(function (it) {
                var linea = { descripcion: String(it.d || '').slice(0, 200), cantidad: Number(it.c) || 1, precio_unitario: Number(it.u) || 0 };
                if (it.p) linea.producto_id = it.p;
                if (it.n) linea.precio_negociado = Number(it.n);
                return linea;
            }).filter(function (l) { return l.descripcion; });
            if (propuestas.length) lineas = propuestas;
        } catch (err) {
            console.error('Líneas de la IA ilegibles', err);
        }
    }
    var cotizacion = cordFetch('/api/v1/cotizaciones', {
        method: 'post',
        payload: { cliente_id: clienteId, items: lineas },
    });
    if (!cotizacion.ok || !cotizacion.data || !cotizacion.data.data) {
        return notificar(mensajeDeError(cotizacion, T('No se pudo crear la cotización en Cord.')));
    }

    var datos = cotizacion.data.data;
    var url = CORD + '/app/cotizaciones/' + datos.id;
    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado(T('Cotización creada'), datos.folio || ''))
        .addSection(CardService.newCardSection()
            .addWidget(CardService.newDecoratedText()
                .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
                .setTopLabel(ESTADOS[IDIOMA].draft)
                .setText('<b>' + escaparHtml(datos.folio || T('Cotización')) + '</b>')
                .setBottomLabel(p.nombre || p.email || '')
                .setWrapText(true))
            .addWidget(textoSimple(T('<font color="#6b7280">Agrega los productos y el precio en Cord, y envíala desde ahí.</font>'))))
        .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(
            boton(T('Terminar en Cord'), CardService.TextButtonStyle.FILLED).setBackgroundColor(NAVY).setOpenLink(enlace(url))))
        .build();

    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(tarjeta))
        .setNotification(CardService.newNotification().setText(T('Cotización ') + (datos.folio || '') + T(' creada.')))
        .build();
}

// ── Al redactar ───────────────────────────────────────────────────────────────

function onGmailCompose(e) {
    exigirPermisos(e);
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
        seccion.addWidget(textoSimple(mensajeDeError(datos.r, T('No se pudieron traer tus cotizaciones de Cord. Inténtalo otra vez.'))));
    } else if (!cotizaciones.length) {
        seccion.addWidget(textoSimple(cliente
            ? T('Este cliente todavía no tiene cotizaciones enviadas.')
            : T('Todavía no tienes cotizaciones enviadas.')));
    }

    cotizaciones.forEach(function (q, i) {
        if (i > 0) seccion.addWidget(CardService.newDivider());
        seccion.addWidget(filaCotizacion(q)
            .setButton(boton(T('Insertar'), CardService.TextButtonStyle.FILLED)
                .setBackgroundColor(NAVY)
                .setOnClickAction(CardService.newAction()
                    .setFunctionName('insertarCotizacion')
                    .setParameters(parametrosTarjeta(q)))));
    });

    var subtitulo = cliente ? T('Para ') + (cliente.empresa || email) : T('Tus cotizaciones enviadas');
    return [CardService.newCardBuilder()
        .setHeader(encabezado(T('Insertar cotización'), subtitulo))
        .addSection(seccion)
        .build()];
}

/**
 * La cotización como tarjeta de correo, no un link suelto. Es HTML de correo:
 * tablas y estilos en línea, porque los clientes de correo ignoran el CSS externo.
 */
function tarjetaHtml(p) {
    var link = escaparHtml(p.link);
    var detalle = [p.cliente, p.vigencia ? T('Vigente hasta el ') + p.vigencia : ''].filter(Boolean).map(escaparHtml).join(' &middot; ');
    return ''
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e5e7eb;border-radius:16px;max-width:460px;width:100%;margin:12px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">'
        + '<tr><td style="padding:22px 24px">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8a93a3">Cotización ' + escaparHtml(p.folio) + '</div>'
        + (p.importe ? '<div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#050505;margin:8px 0 4px">' + escaparHtml(p.importe) + '</div>' : '')
        + (detalle ? '<div style="font-size:13px;line-height:1.5;color:#5b6472">' + detalle + '</div>' : '')
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr>'
        + '<td style="border-radius:999px;background:#0a192f"><a href="' + link + '" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">' + T('Ver cotización') + '</a></td>'
        + '</tr></table>'
        + '</td></tr></table><br>';
}

function parametrosTarjeta(q) {
    return {
        link: q.link_publico || '',
        folio: q.folio || '',
        cliente: q.cliente || '',
        importe: dinero(q.total, q.moneda),
        vigencia: fechaCorta(q.vigencia),
    };
}

function insertarCotizacion(e) {
    fijarIdioma(e);
    var p = e.parameters || {};
    if (!/^https:\/\//.test(p.link || '')) return notificar(T('Esa cotización no tiene un link válido.'));
    return CardService.newUpdateDraftActionResponseBuilder()
        .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
            .addUpdateContent(tarjetaHtml(p), CardService.ContentType.MUTABLE_HTML)
            .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
        .build();
}

/**
 * Responde en el MISMO hilo, desde el Gmail de quien vende: el cliente ve la
 * cotización en la conversación que ya tiene, y su respuesta llega a esa persona.
 */
function responderConCotizacion(e) {
    fijarIdioma(e);
    var p = e.parameters || {};
    if (!/^https:\/\//.test(p.link || '')) return notificar(T('Esa cotización todavía no tiene link: envíala primero desde Cord.'));
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var texto = T('Te comparto la cotización ') + p.folio + ': ' + p.link;
    var html = T('<p>Hola, te comparto la cotización ') + escaparHtml(p.folio) + '.</p>' + tarjetaHtml(p);
    var borrador = GmailApp.getMessageById(e.gmail.messageId).createDraftReply(texto, { htmlBody: html });
    return CardService.newComposeActionResponseBuilder().setGmailDraft(borrador).build();
}

function reenviarPorCord(e) {
    fijarIdioma(e);
    var p = e.parameters || {};
    var r = cordFetch('/api/v1/cotizaciones/' + encodeURIComponent(p.id), { method: 'post', payload: { action: 'resend' } });
    return notificar(r.ok ? T('Cord le volvió a mandar la cotización ') + p.folio + '.' : mensajeDeError(r, T('No se pudo reenviar la cotización.')));
}
