import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv',
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
      const file = path.resolve(
        root,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
      if (
        !file.startsWith(root + path.sep) ||
        pathname.includes('/.') ||
        !['.html', '.js', '.css', '.svg', '.csv'].includes(path.extname(file))
      ) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res
        .writeHead(200, {
          'Content-Type':
            (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        .end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(Number(process.env.PORT || 4173), '127.0.0.1', () =>
    console.log(`Just Word: http://127.0.0.1:${process.env.PORT || 4173}`),
  );
