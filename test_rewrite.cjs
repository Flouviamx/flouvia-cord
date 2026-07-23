const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4321,
  path: '/',
  method: 'GET',
  headers: {
    'Host': 'dev.cordhq.app'
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log("Body includes 'dev-hero':", body.includes('dev-hero'));
    console.log("Body includes 'hero-inner':", body.includes('hero-inner'));
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
