const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const prisma = require('./config/prisma');
const cacheService = require('./services/cache.service');

// Limit workers to a reasonable number
const WORKERS = Math.min(numCPUs, 2);

async function shutdownWorker(server, force = false) {
  return new Promise((resolve) => {
    const timeout = force ? 2000 : 30000;

    if (server) {
      server.close(async () => {
        try {
          await cacheService.shutdown();
          await prisma.$disconnect();
        } catch (error) {
          logger.error('Error during cleanup:', error);
        }
        resolve();
      });

      // Force close if taking too long
      setTimeout(() => {
        resolve();
      }, timeout);
    } else {
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
    const shutdown = async (signal) => {
      logger.info(`Worker received ${signal}`);
      await shutdownWorker(server);
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle connection errors
    server.on('error', async (error) => {
      logger.error('Server error:', error);
      await shutdownWorker(server, true);
      process.exit(1);
    });

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception:', error);
      // Don't exit for header errors
      if (error.code !== 'ERR_HTTP_HEADERS_SENT') {
        await shutdownWorker(server, true);
        process.exit(1);
      }
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error('Unhandled Rejection:', reason);
      // Don't exit for header errors
      if (reason?.code !== 'ERR_HTTP_HEADERS_SENT') {
        await shutdownWorker(server, true);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('Failed to start worker:', error);
    await shutdownWorker(server, true);
    process.exit(1);
  }
}

if (cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);

  const workers = new Set();

  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork();
    workers.add(worker);
  }

  cluster.on('exit', (worker, code, signal) => {
    workers.delete(worker);
    logger.info(`Worker ${worker.process.pid} died. Signal: ${signal}. Code: ${code}`);

    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info('Starting a new worker...');
      const newWorker = cluster.fork();
      workers.add(newWorker);
    }
  });

  process.on('SIGTERM', () => {
    logger.info('Master received shutdown signal');

    for (const worker of workers) {
      worker.send('shutdown');
    }

    setTimeout(() => {
      logger.info('Forcing shutdown of remaining workers');
      for (const worker of workers) {
        worker.kill('SIGKILL');
      }
      process.exit(0);
    }, 35000);
  });
} else {
  process.on('message', async (msg) => {
    if (msg === 'shutdown') {
      logger.info('Worker received shutdown message');
      setTimeout(() => process.exit(0), 5000);
    }
  });

  startWorker();
}
