'use strict';
// n8n carga los nodos por las rutas del bloque `n8n` del package.json; este
// index existe para que el paquete se pueda requerir suelto (pruebas, scripts).
module.exports = {
    Cord: require('./nodes/Cord/Cord.node.js').Cord,
    CordTrigger: require('./nodes/Cord/CordTrigger.node.js').CordTrigger,
    CordApi: require('./credentials/CordApi.credentials.js').CordApi,
};
