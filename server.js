// 의존성 없는 정적 파일 서버: node server.js → http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const port = process.env.PORT || 5173;
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(__dirname, url === '/' ? 'index.html' : url);
  if (!file.startsWith(__dirname)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
