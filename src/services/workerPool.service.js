// src/services/workerPool.service.js
const { Worker } = require('worker_threads');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../config/logger');

class WorkerPool extends EventEmitter {
  constructor(size = 4) {
    super();
    this.size = size;
    this.workers = new Map();
    this.queue = [];
    this.initialize();
  }

  initialize() {
    for (let i = 0; i < this.size; i++) {
      this.addWorker(i);
    }
  }

  addWorker(id) {
    const worker = new Worker(path.join(__dirname, 'workers', 'company.worker.js'));

    worker.on('message', (message) => {
      const { type, data, taskId } = message;

      if (type === 'COMPLETE') {
        this.workers.get(id).busy = false;
        this.emit('taskComplete', { id, data, taskId });
        this.processNextTask();
      } else if (type === 'ERROR') {
        this.workers.get(id).busy = false;
        this.emit('taskError', { id, error: data, taskId });
        this.processNextTask();
      } else if (type === 'PROGRESS') {
        this.emit('taskProgress', { id, data, taskId });
      }
    });

    worker.on('error', (error) => {
      logger.error(`Worker ${id} error:`, error);
      this.workers.get(id).busy = false;
      this.processNextTask();
    });

    this.workers.set(id, { worker, busy: false });
  }

  async executeTask(task) {
    return new Promise((resolve, reject) => {
      const availableWorker = this.getAvailableWorker();

      if (availableWorker) {
        const { id, worker } = availableWorker;
        this.workers.get(id).busy = true;

        const taskId = Math.random().toString(36).substr(2, 9);

        const timeout = setTimeout(() => {
          this.workers.get(id).busy = false;
          reject(new Error('Task timeout'));
        }, 30000); // 30 second timeout

        const cleanup = () => {
          clearTimeout(timeout);
          this.removeListener('taskComplete', handleComplete);
          this.removeListener('taskError', handleError);
        };

        const handleComplete = (result) => {
          if (result.taskId === taskId) {
            cleanup();
            resolve(result.data);
          }
        };

        const handleError = (error) => {
          if (error.taskId === taskId) {
            cleanup();
            reject(error.error);
          }
        };

        this.once('taskComplete', handleComplete);
        this.once('taskError', handleError);

        worker.postMessage({ ...task, taskId });
      } else {
        this.queue.push({ task, resolve, reject });
      }
    });
  }

  getAvailableWorker() {
    for (const [id, { worker, busy }] of this.workers.entries()) {
      if (!busy) {
        return { id, worker };
      }
    }
    return null;
  }

  processNextTask() {
    if (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.executeTask(task).then(resolve).catch(reject);
    }
  }

  terminate() {
    for (const { worker } of this.workers.values()) {
      worker.terminate();
    }
  }
}

module.exports = new WorkerPool();
