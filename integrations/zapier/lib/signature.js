'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const TOLERANCE_SECONDS = 300;

function findHeader(headers, name) {
    if (!headers || typeof headers !== 'object') return null;
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        const k = key.toLowerCase().replace(/^http-/, '');
        if (k === wanted) return Array.isArray(value) ? String(value[0]) : String(value);
    }
    return null;
}

function parseHeader(header) {
    let timestamp = null;
    const signatures = [];
    for (const part of String(header).split(',')) {
        const [k, v] = part.trim().split('=');
        if (k === 't' && /^\d+$/.test(v || '')) timestamp = Number(v);
        if (k === 'v1' && /^[a-f0-9]{64}$/.test(v || '')) signatures.push(v);
    }
    return { timestamp, signatures };
}

function verifyCordSignature({ secret, headers, content, nowSeconds = Math.floor(Date.now() / 1000) }) {
    if (typeof secret !== 'string' || !secret || typeof content !== 'string') return false;
    const header = findHeader(headers, 'x-cord-signature-v1');
    if (!header) return false;
    const { timestamp, signatures } = parseHeader(header);
    if (timestamp === null || !signatures.length) return false;
    if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${content}`).digest('hex'));
    return signatures.some((sig) => {
        const given = Buffer.from(sig);
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

module.exports = { verifyCordSignature, findHeader, TOLERANCE_SECONDS };
