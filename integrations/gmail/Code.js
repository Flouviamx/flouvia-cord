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
function partirRemitente(from) {
    var texto = String(from || '');
    var m = texto.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (m) return { nombre: m[1].trim(), email: m[2].trim().toLowerCase() };
    return { nombre: '', email: texto.trim().toLowerCase() };
}

function encabezado(titulo, subtitulo) {
    var h = CardService.newCardHeader().setTitle(titulo);
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

// ── Tarjeta de conexión ───────────────────────────────────────────────────────

function tarjetaConectar(mensajeError) {
    var seccion = CardService.newCardSection()
        .addWidget(textoSimple(
            'Conecta tu espacio de Cord para crear cotizaciones desde tus correos. '
            + 'Se autoriza en la pantalla de Cord; no tienes que copiar nada.',
        ))
        .addWidget(CardService.newTextButton()
            .setText('Conectar con Cord')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            // Al cerrarse la ventana de Cord, Gmail vuelve a pintar el
            // complemento y `conectado()` recoge la autorización.
            .setOpenLink(CardService.newOpenLink()
                .setUrl(urlAutorizacion())
                .setOpenAs(CardService.OpenAs.OVERLAY)
                .setOnClose(CardService.OnClose.RELOAD)))
        .addWidget(CardService.newTextButton()
            .setText('Ya autoricé')
            .setOnClickAction(CardService.newAction().setFunctionName('revisarConexion')));

    if (mensajeError) seccion.addWidget(textoSimple('<font color="#b3261e">' + mensajeError + '</font>'));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Conecta tu cuenta de Cord'))
        .addSection(seccion)
        .build();
}

function revisarConexion(e) {
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

// ── Inicio ────────────────────────────────────────────────────────────────────

function onHomepage() {
    return conectado() ? tarjetaInicio() : tarjetaConectar();
}

function tarjetaInicio() {
    var seccion = CardService.newCardSection()
        .addWidget(textoSimple(
            'Abre un correo de un cliente y Cord te deja crear su cotización sin salir de Gmail.',
        ))
        .addWidget(CardService.newTextButton()
            .setText('Abrir Cord')
            .setOpenLink(CardService.newOpenLink().setUrl(CORD + '/app')))
        .addWidget(CardService.newTextButton()
            .setText('Desconectar')
            .setOnClickAction(CardService.newAction().setFunctionName('desconectar')));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord', 'Conectado'))
        .addSection(seccion)
        .build();
}

// ── Tarjeta sobre un correo ───────────────────────────────────────────────────

function onGmailMessage(e) {
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

    var busqueda = cordFetch('/api/v1/clientes?email=' + encodeURIComponent(quien.email) + '&limit=1');
    if (busqueda.status === 401) {
        borrarTokens();
        return tarjetaConectar('La conexión con Cord venció o se revocó. Vuelve a conectar.');
    }

    var cliente = busqueda.ok && busqueda.data && busqueda.data.data && busqueda.data.data[0]
        ? busqueda.data.data[0]
        : null;

    var seccion = CardService.newCardSection();
    seccion.addWidget(CardService.newDecoratedText()
        .setTopLabel(cliente ? 'Cliente en Cord' : 'Todavía no es tu cliente')
        .setText(cliente ? (cliente.empresa || quien.email) : (quien.nombre || quien.email))
        .setBottomLabel(quien.email)
        .setWrapText(true));

    seccion.addWidget(CardService.newTextButton()
        .setText(cliente ? 'Crear cotización' : 'Crear cliente y cotización')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction()
            .setFunctionName('crearCotizacion')
            .setParameters({
                email: quien.email,
                nombre: quien.nombre || '',
                asunto: asunto,
                clienteId: cliente ? String(cliente.id) : '',
            })));

    if (cliente) {
        seccion.addWidget(CardService.newTextButton()
            .setText('Ver en Cord')
            .setOpenLink(CardService.newOpenLink().setUrl(CORD + '/app/clientes/' + cliente.id)));
    }

    return CardService.newCardBuilder()
        .setHeader(encabezado('Cord'))
        .addSection(seccion)
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
                : 'No se pudo crear el cliente en Cord.');
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
        return notificar('No se pudo crear la cotización en Cord.');
    }

    var datos = cotizacion.data.data;
    var tarjeta = CardService.newCardBuilder()
        .setHeader(encabezado('Cotización creada', datos.folio || ''))
        .addSection(CardService.newCardSection()
            .addWidget(textoSimple('Ábrela en Cord para poner los productos y el precio, y mandarla.'))
            .addWidget(CardService.newTextButton()
                .setText('Abrir ' + (datos.folio || 'la cotización'))
                .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
                .setOpenLink(CardService.newOpenLink().setUrl(CORD + '/app/cotizaciones/' + datos.id))))
        .build();

    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(tarjeta))
        .setNotification(CardService.newNotification().setText('Cotización ' + (datos.folio || '') + ' creada.'))
        .build();
}

// ── Al redactar ───────────────────────────────────────────────────────────────

var ESTADOS = {
    sent: 'Enviada', viewed: 'Vista', approved: 'Aprobada', rejected: 'Rechazada',
    expired: 'Vencida', paid: 'Pagada', invoiced: 'Facturada',
};

function escaparHtml(texto) {
    return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function onGmailCompose(e) {
    if (!conectado()) return [tarjetaConectar()];

    var para = (e.draftMetadata && e.draftMetadata.toRecipients) || [];
    var email = para.length ? partirRemitente(para[0]).email : '';
    var cliente = null;
    if (email) {
        var busqueda = cordFetch('/api/v1/clientes?email=' + encodeURIComponent(email) + '&limit=1');
        if (busqueda.status === 401) {
            borrarTokens();
            return [tarjetaConectar('La conexión con Cord venció o se revocó. Vuelve a conectar.')];
        }
        cliente = busqueda.ok && busqueda.data && busqueda.data.data && busqueda.data.data[0] ? busqueda.data.data[0] : null;
    }

    var lista = cordFetch('/api/v1/cotizaciones?limit=25' + (cliente ? '&cliente_id=' + encodeURIComponent(cliente.id) : ''));
    if (lista.status === 401) {
        borrarTokens();
        return [tarjetaConectar('La conexión con Cord venció o se revocó. Vuelve a conectar.')];
    }
    // Un borrador todavía no tiene una página que el cliente pueda abrir.
    var cotizaciones = (lista.ok && lista.data && lista.data.data ? lista.data.data : [])
        .filter(function (q) { return q.status !== 'draft' && q.link_publico; })
        .slice(0, 10);

    var seccion = CardService.newCardSection()
        .setHeader(cliente ? 'Cotizaciones de ' + (cliente.empresa || email) : 'Cotizaciones recientes');

    if (!lista.ok) {
        seccion.addWidget(textoSimple('No se pudieron traer tus cotizaciones de Cord. Inténtalo otra vez.'));
    } else if (!cotizaciones.length) {
        seccion.addWidget(textoSimple(cliente
            ? 'Este cliente todavía no tiene cotizaciones enviadas.'
            : 'Todavía no tienes cotizaciones enviadas.'));
    }

    cotizaciones.forEach(function (q) {
        seccion.addWidget(CardService.newDecoratedText()
            .setTopLabel(ESTADOS[q.status] || q.status)
            .setText(q.folio)
            .setBottomLabel(q.cliente || '')
            .setWrapText(true)
            .setButton(CardService.newTextButton()
                .setText('Insertar')
                .setOnClickAction(CardService.newAction()
                    .setFunctionName('insertarLink')
                    .setParameters({ link: q.link_publico, folio: q.folio }))));
    });

    return [CardService.newCardBuilder()
        .setHeader(encabezado('Insertar cotización'))
        .addSection(seccion)
        .build()];
}

function insertarLink(e) {
    var p = e.parameters || {};
    if (!/^https:\/\//.test(p.link || '')) return notificar('Esa cotización no tiene un link válido.');
    var html = '<a href="' + escaparHtml(p.link) + '">Ver cotización ' + escaparHtml(p.folio) + '</a>';
    return CardService.newUpdateDraftActionResponseBuilder()
        .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
            .addUpdateContent(html, CardService.ContentType.MUTABLE_HTML)
            .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
        .build();
}
