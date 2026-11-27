'use strict';

const http = require('node:http');

let searchRequests = 0;

const server = http.createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  response.setHeader('content-type', 'application/json; charset=utf-8');

  if (path === '/health') {
    response.writeHead(200).end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (path === '/requests') {
    response.writeHead(200).end(JSON.stringify({ searchRequests }));
    return;
  }
  if (path !== '/search') {
    response.writeHead(404).end(JSON.stringify({ error: 'not found' }));
    return;
  }

  searchRequests += 1;
  const query = new URL(
    request.url ?? '/',
    'http://127.0.0.1',
  ).searchParams.get('q');
  const city = query?.split(',')[0]?.trim() || 'Docker City';
  response.writeHead(200).end(
    JSON.stringify([
      {
        lat: '40.4168',
        lon: '-3.7038',
        osm_type: 'relation',
        osm_id: String(987654321 + searchRequests),
        address: {
          city,
          state: 'Community of Madrid',
          country: 'Spain',
          country_code: 'es',
        },
        namedetails: { 'name:es': city },
      },
    ]),
  );
});

server.listen(55473, '127.0.0.1');
