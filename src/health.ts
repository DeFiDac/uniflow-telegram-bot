import http from 'http';

const PORT = process.env.PORT || 3000;

export const startHealthServer = () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          bot: 'UniFlow',
        }),
      );
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`🏥 Health check server running on port ${PORT}`);
  });

  return server;
};
