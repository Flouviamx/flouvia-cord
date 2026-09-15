'use strict';

const BASE_URL = (process.env.CORD_BASE_URL || 'https://cordhq.app').replace(/\/+$/, '');

const api = (path) => `${BASE_URL}/api/v1${path}`;

module.exports = { BASE_URL, api };
