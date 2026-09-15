'use strict';

const { version: platformVersion } = require('zapier-platform-core');
const { version } = require('./package.json');
const authentication = require('./authentication');
const { addAuth, handleErrors } = require('./lib/middleware');
const triggers = require('./triggers');
const creates = require('./creates');
const searches = require('./searches');

module.exports = {
    version,
    platformVersion,
    authentication,
    beforeRequest: [addAuth],
    afterResponse: [handleErrors],
    triggers,
    creates,
    searches,
    searchOrCreates: {
        find_client: {
            key: 'find_client',
            display: { label: 'Find or Create Client', description: 'Finds a client by email or name, and creates it if it does not exist.' },
            search: 'find_client',
            create: 'create_client',
        },
    },
};
