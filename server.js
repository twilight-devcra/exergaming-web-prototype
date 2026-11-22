// 의존성 없는 정적 파일 서버: node server.js → http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const port = process.env.PORT || 5173;
http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]);
  // GitHub Pages 처럼 폴더 주소(/, /app/)는 그 안의 index.html 을 연다
  const file = path.join(__dirname, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(__dirname)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('not found');
    response.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    response.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
