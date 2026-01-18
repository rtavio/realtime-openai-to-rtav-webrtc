#!/usr/bin/env node
/**
 * Simple HTTP server for serving the side-by-side.html comparison demo
 * 
 * Usage:
 *   node server.js [port]
 * 
 * Default port: 3000
 * 
 * Environment variables:
 *   RTAV_API_URL - The RTAV API URL to use (default: https://api.rtav.io)
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 3000;
const HTML_FILE = path.join(__dirname, 'side-by-side.html');
const RTAV_API_URL = process.env.RTAV_API_URL || 'https://api.rtav.io';

// Check if API URL is localhost/private IP (for SSL certificate handling)
const parsedApiUrl = new URL(RTAV_API_URL);
const isLocalhostOrPrivateIp = (
  parsedApiUrl.hostname === 'localhost' ||
  parsedApiUrl.hostname === '127.0.0.1' ||
  parsedApiUrl.hostname === '::1' ||
  (parsedApiUrl.hostname && (
    parsedApiUrl.hostname.startsWith('192.168.') ||
    parsedApiUrl.hostname.startsWith('10.') ||
    (parsedApiUrl.hostname.startsWith('172.') &&
      parseInt(parsedApiUrl.hostname.split('.')[1] || '0') >= 16 &&
      parseInt(parsedApiUrl.hostname.split('.')[1] || '0') <= 31)
  ))
);

const server = http.createServer((req, res) => {
  // Serve API URL endpoint
  if (req.url === '/api-url' && req.method === 'GET') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ apiUrl: RTAV_API_URL }));
    return;
  }

  // Proxy API requests to avoid browser certificate issues with self-signed certs
  if (req.url.startsWith('/proxy/v1/realtime/calls') && req.method === 'POST') {
    // Parse the request body (multipart/form-data)
    let body = [];
    req.on('data', chunk => {
      body.push(chunk);
    });
    req.on('end', () => {
      const requestBody = Buffer.concat(body);
      
      // Forward to actual API server
      const apiUrl = new URL(`${RTAV_API_URL}/v1/realtime/calls`);
      const protocolModule = apiUrl.protocol === 'https:' ? https : http;
      
      // Get Authorization header from original request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Authorization header required' }));
        return;
      }
      
      const options = {
        hostname: apiUrl.hostname,
        port: apiUrl.port || (apiUrl.protocol === 'https:' ? 8443 : 8000),
        path: apiUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': req.headers['content-type'] || 'multipart/form-data',
          'Content-Length': requestBody.length
        },
        ...(isLocalhostOrPrivateIp && apiUrl.protocol === 'https:' && {
          rejectUnauthorized: false  // Disable SSL verification for localhost/private IP
        })
      };
      
      const proxyReq = protocolModule.request(options, (proxyRes) => {
        // Forward status and headers
        res.writeHead(proxyRes.statusCode || 200, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*'
        });
        
        // Forward response body
        proxyRes.on('data', (chunk) => {
          res.write(chunk);
        });
        
        proxyRes.on('end', () => {
          res.end();
        });
      });
      
      proxyReq.on('error', (error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: `Proxy error: ${error.message}` }));
      });
      
      proxyReq.write(requestBody);
      proxyReq.end();
    });
    return;
  }

  // Serve the HTML file
  if (req.url === '/' || req.url === '/side-by-side.html') {
    fs.readFile(HTML_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading HTML file: ' + err.message);
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}/`);
  console.log(`📄 Serving: ${HTML_FILE}`);
  console.log(`🔗 RTAV API URL: ${RTAV_API_URL}`);
  console.log(`📡 API URL endpoint: http://localhost:${PORT}/api-url`);
  if (isLocalhostOrPrivateIp) {
    console.log(`🔀 Proxy endpoint: http://localhost:${PORT}/proxy/v1/realtime/calls (for localhost/private IP to avoid browser certificate issues)`);
  }
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});
