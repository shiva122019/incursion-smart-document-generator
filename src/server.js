import { app } from './app.js';
import { config } from './config/env.js';
import { closePool, testConnection } from './database/connection.js';

const PORT = config.port || 4000;

export async function startServer() {
  // Test DB connection before listening
  const dbHealth = await testConnection();
  if (dbHealth.healthy) {
    console.log(`[Database] PostgreSQL connection established successfully.`);
  } else {
    console.warn(`[Database] Warning: PostgreSQL not immediately reachable: ${dbHealth.error}`);
  }

  const server = app.listen(PORT, () => {
    console.log(`[Server] Smart Document Generator API listening on port ${PORT} [${config.env}]`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log('[Server] HTTP listener closed.');
      await closePool();
      console.log('[Database] Connection pool drained.');
      process.exit(0);
    });

    // Force shutdown after 10s if stuck
    setTimeout(() => {
      console.error('[Server] Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return { server, app };
}

// Start if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().catch((err) => {
    console.error('[Server Startup Failure]', err.message);
    process.exit(1);
  });
}
