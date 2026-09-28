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
 *  - Los tokens viven en las propiedades del USUARIO: cada persona conecta su
 *    propio espacio de Cord y nadie ve los tokens de nadie. Las credenciales
 *    del cliente OAuth viven en las propiedades del SCRIPT, que solo ve quien
 *    lo publica: nunca en este archivo ni en git.
 *  - No manda el cuerpo del correo a Cord. Del mensaje salen el remitente y el
 *    asunto, y nada más; el contenido de un correo es del negocio, no nuestro.
 */

var CORD = 'https://cordhq.app';
var PROP_TOKENS = 'cord_oauth';

// ── OAuth con Cord ────────────────────────────────────────────────────────────

function credencialesCliente() {
    var p = PropertiesService.getScriptProperties();
    return { id: p.getProperty('CORD_CLIENT_ID') || '', secret: p.getProperty('CORD_CLIENT_SECRET') || '' };
}

function urlDeRegreso() {
    return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

/**
 * El `state` lo firma Apps Script: identifica a qué función volver y caduca solo.
 * Así una vuelta que no inició este complemento no llega a canjear nada.
 */
function urlAutorizacion() {
    var state = ScriptApp.newStateToken().withMethod('alVolverDeCord').withTimeout(600).createToken();
    return CORD + '/oauth/authorize'
        + '?response_type=code'
        + '&client_id=' + encodeURIComponent(credencialesCliente().id)
        + '&redirect_uri=' + encodeURIComponent(urlDeRegreso())
        + '&scope=write'
        + '&state=' + encodeURIComponent(state);
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

/** Pide tokens a Cord. Devuelve el objeto de tokens o null; nunca lanza. */
function pedirTokens(params) {
    var c = credencialesCliente();
    params.client_id = c.id;
    params.client_secret = c.secret;
    try {
        var res = UrlFetchApp.fetch(CORD + '/api/oauth/token', {
            method: 'post', payload: params, muteHttpExceptions: true,
        });
        if (res.getResponseCode() !== 200) {
            console.error('Cord rechazó el token', res.getResponseCode(), res.getContentText().slice(0, 300));
            return null;
        }
        return JSON.parse(res.getContentText());
    } catch (err) {
        console.error('No se pudo pedir el token a Cord', err);
        return null;
    }
}

/** Adonde vuelve la ventana de autorización de Cord. */
function alVolverDeCord(request) {
    var p = request.parameter || {};
    if (p.error || !p.code) {
        return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">No se conectó. Cierra esta ventana e inténtalo otra vez.</p>');
    }
    var tokens = pedirTokens({ grant_type: 'authorization_code', code: p.code, redirect_uri: urlDeRegreso() });
    if (!tokens || !tokens.access_token) {
        return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Cord no aceptó la conexión. Cierra esta ventana e inténtalo otra vez.</p>');
    }
    guardarTokens(tokens);
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Listo, Cord quedó conectado. Ya puedes cerrar esta ventana.</p><script>setTimeout(function(){window.close()},800)</script>');
}

/**
 * Un token vigente, renovándolo si está por vencer. Cord rota el refresh token
 * en cada renovación y detecta el reuso, así que se guarda el nuevo SIEMPRE.
 */
function tokenVigente() {
    var t = leerTokens();
    if (!t) return '';
    if (t.vence > Date.now() + 60000) return t.access;
    var frescos = pedirTokens({ grant_type: 'refresh_token', refresh_token: t.refresh });
    if (!frescos || !frescos.access_token) {
        borrarTokens();
        return '';
    }
    guardarTokens(frescos);
    return frescos.access_token;
}

function conectado() {
    return Boolean(leerTokens());
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
            // La acción de autorización abre la pantalla de Cord en una ventana y,
            // al cerrarla, Gmail vuelve a pintar el complemento ya conectado.
            .setAuthorizationAction(CardService.newAuthorizationAction().setAuthorizationUrl(urlAutorizacion())));

    if (mensajeError) seccion.addWidget(textoSimple('<font color="#b3261e">' + mensajeError + '</font>'));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Conecta tu cuenta de Cord'))
        .addSection(seccion)
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
