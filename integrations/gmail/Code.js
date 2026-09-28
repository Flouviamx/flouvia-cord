/**
 * Cord para Gmail — abre una cotización desde el correo del cliente.
 *
 * Qué hace y qué NO hace, a propósito:
 *
 *  - Lee SOLO el correo que tienes abierto, con el permiso más estrecho que da
 *    Google para complementos (`gmail.addons.current.message.readonly`). No lee
 *    tu bandeja: ese permiso es "restringido" y obliga a una auditoría de
 *    seguridad anual de un tercero.
 *  - La llave de Cord se guarda en las propiedades del USUARIO, no del script:
 *    cada persona conecta su propia cuenta y nadie ve la llave de nadie.
 *  - No manda el cuerpo del correo a Cord. Del mensaje salen el remitente y el
 *    asunto, y nada más; el contenido de un correo es del negocio, no nuestro.
 */

var CORD = 'https://cordhq.app';
var PROP_LLAVE = 'cord_api_key';

// ── Utilidades ────────────────────────────────────────────────────────────────

function llaveGuardada() {
    return PropertiesService.getUserProperties().getProperty(PROP_LLAVE) || '';
}

/**
 * Llama a la API de Cord. Devuelve { ok, status, data }, nunca lanza: una tarjeta
 * de Gmail que revienta deja al vendedor sin nada que leer.
 */
function cordFetch(ruta, opciones) {
    var llave = llaveGuardada();
    if (!llave) return { ok: false, status: 401, data: null };
    var config = {
        method: (opciones && opciones.method) || 'get',
        headers: { Authorization: 'Bearer ' + llave },
        contentType: 'application/json',
        muteHttpExceptions: true,
    };
    if (opciones && opciones.payload) config.payload = JSON.stringify(opciones.payload);
    try {
        var res = UrlFetchApp.fetch(CORD + ruta, config);
        var texto = res.getContentText();
        var cuerpo = texto ? JSON.parse(texto) : null;
        return { ok: res.getResponseCode() < 300, status: res.getResponseCode(), data: cuerpo };
    } catch (err) {
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
            'Pega una llave de API de Cord con permiso de escritura. La creas en '
            + 'Ajustes › API dentro de Cord.',
        ))
        .addWidget(CardService.newTextInput()
            .setFieldName('llave')
            .setTitle('Llave de API')
            .setHint('Empieza con sk_'))
        .addWidget(CardService.newTextButton()
            .setText('Conectar')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(CardService.newAction().setFunctionName('guardarLlave')));

    if (mensajeError) seccion.addWidget(textoSimple('<font color="#b3261e">' + mensajeError + '</font>'));

    return CardService.newCardBuilder()
        .setHeader(encabezado('Conecta tu cuenta de Cord'))
        .addSection(seccion)
        .build();
}

function guardarLlave(e) {
    var llave = ((e.formInput && e.formInput.llave) || '').trim();
    if (!llave) return notificar('Escribe la llave primero.');

    PropertiesService.getUserProperties().setProperty(PROP_LLAVE, llave);
    // Se prueba contra Cord ANTES de dar por buena la conexión: una llave mal
    // pegada que "se guarda bien" falla después, en medio de una venta.
    var prueba = cordFetch('/api/v1/me');
    if (!prueba.ok) {
        PropertiesService.getUserProperties().deleteProperty(PROP_LLAVE);
        return CardService.newActionResponseBuilder()
            .setNavigation(CardService.newNavigation().updateCard(
                tarjetaConectar(prueba.status === 401
                    ? 'Esa llave no la reconoce Cord. Revisa que sea de escritura y que no esté revocada.'
                    : 'No se pudo hablar con Cord. Inténtalo otra vez en un momento.'),
            ))
            .setNotification(CardService.newNotification().setText('No se conectó.'))
            .build();
    }

    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(tarjetaInicio()))
        .setNotification(CardService.newNotification().setText('Cuenta conectada.'))
        .build();
}

function desconectar() {
    PropertiesService.getUserProperties().deleteProperty(PROP_LLAVE);
    return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(tarjetaConectar()))
        .setNotification(CardService.newNotification().setText('Cuenta desconectada.'))
        .build();
}

// ── Inicio ────────────────────────────────────────────────────────────────────

function onHomepage() {
    return llaveGuardada() ? tarjetaInicio() : tarjetaConectar();
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
    if (!llaveGuardada()) return tarjetaConectar();

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
    if (busqueda.status === 401) return tarjetaConectar('Tu llave dejó de funcionar. Pega una nueva.');

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
