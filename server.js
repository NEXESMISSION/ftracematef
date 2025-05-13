// Simple development server for TraceMate
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { createServer as createViteServer } from 'vite';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

async function startServer() {
  // Create Vite dev server
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  const server = createServer(async (req, res) => {
    try {
      // Use Vite's connect instance as middleware
      const middleware = vite.middlewares;
      middleware(req, res, async () => {
        // If Vite doesn't handle the request, serve static files
        try {
          let filePath = join(__dirname, req.url === '/' ? 'index.html' : req.url);
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || 'text/plain';
          
          const content = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        } catch (err) {
          // For SPA, serve index.html for routes not found
          if (err.code === 'ENOENT') {
            const content = await readFile(join(__dirname, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          } else {
            res.writeHead(500);
            res.end(`Server Error: ${err.code}`);
          }
        }
      });
    } catch (error) {
      console.error('Error processing request:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`TraceMate server running at http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
