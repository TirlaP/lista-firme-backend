const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const prisma = require('./config/prisma');
const cacheService = require('./services/cache.service');

// Limit workers to a reasonable number
const WORKERS = Math.min(numCPUs, 2); // Reduced to 2 workers to minimize connection issues

async function shutdownWorker(server, force = false) {
  return new Promise((resolve) => {
    const timeout = force ? 2000 : 30000;

    try {
      server.close(async () => {
        try {
          await cacheService.shutdown();
          await prisma.$disconnect();
          resolve();
        } catch (error) {
          logger.error('Error during cleanup:', error);
          resolve();
        }
      });

      // Force close if taking too long
      setTimeout(() => {
        resolve();
      }, timeout);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      resolve();
    }
  });
}

async function startWorker() {
  let server;

  try {
    await prisma.$connect();

    // Set up server with timeout
    server = app.listen(config.port, () => {
      logger.info(`Worker ${process.pid} listening on port ${config.port}`);
    });

    // Set server timeouts
    server.timeout = 30000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Handle worker-specific shutdown
    process.on('SIGTERM', async () => {
      await shutdownWorker(server);
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await shutdownWorker(server);
      process.exit(0);
    });

    // Handle connection errors
    server.on('error', async (error) => {
      logger.error('Server error:', error);
      await shutdownWorker(server, true);
      process.exit(1);
    });

    // Handle uncaught errors without crashing
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception:', error);
      if (error.message === 'Cannot set headers after they are sent to the client') {
        // Log but don't crash for header errors
        logger.warn('Header error occurred but continuing execution');
        return;
      }
      await shutdownWorker(server, true);
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error('Unhandled Rejection:', reason);
      if (reason.message === 'Cannot set headers after they are sent to the client') {
        // Log but don't crash for header errors
        logger.warn('Header error occurred but continuing execution');
        return;
      }
      await shutdownWorker(server, true);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start worker:', error);
    if (server) await shutdownWorker(server, true);
    process.exit(1);
  }
}

function startMaster() {
  logger.info(`Master ${process.pid} is running`);

  const workers = new Set();

  // Fork initial workers
  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork();
    workers.add(worker);
  }

  // Handle worker exits
  cluster.on('exit', (worker, code, signal) => {
    workers.delete(worker);
    logger.info(`Worker ${worker.process.pid} died. Signal: ${signal}. Code: ${code}`);

    // Only respawn if not shutting down and unexpected exit
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info('Starting a new worker...');
      const newWorker = cluster.fork();
      workers.add(newWorker);
    }
  });

  // Graceful shutdown handler
  process.on('SIGTERM', () => {
    logger.info('Master received shutdown signal');

    // Stop accepting new connections
    for (const worker of workers) {
      worker.send('shutdown');
    }

    // Force shutdown after timeout
    setTimeout(() => {
      logger.info('Forcing shutdown of remaining workers');
      for (const worker of workers) {
        worker.kill('SIGKILL');
      }
      process.exit(0);
    }, 35000);
  });
}

// Start the application
if (cluster.isMaster) {
  startMaster();
} else {
  // Handle shutdown message from master
  process.on('message', async (msg) => {
    if (msg === 'shutdown') {
      logger.info('Worker received shutdown message');
      setTimeout(() => process.exit(0), 5000);
    }
  });

  startWorker();
}
