#!/usr/bin/env node
const util = require('util');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('../src/config/logger');

// Utility functions
const exec = util.promisify(require('child_process').exec);
async function runCmd(command) {
  try {
    const { stdout, stderr } = await exec(command);
    logger.info(stdout);
    logger.info(stderr);
  } catch {
    (error) => {
      logger.info(error);
    };
  }
}

async function hasYarn() {
  try {
    await execSync('yarnpkg --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Validate arguments
if (process.argv.length < 3) {
  logger.info('Please specify the target project directory.');
  logger.info('For example:');
  logger.info('    npx create-nodejs-app my-app');
  logger.info('    OR');
  logger.info('    npm init nodejs-app my-app');
  process.exit(1);
}

// Define constants
const ownPath = process.cwd();
const folderName = process.argv[2];
const appPath = path.join(ownPath, folderName);
const repo = 'https://github.com/hagopj13/node-express-boilerplate.git';

// Check if directory already exists
try {
  fs.mkdirSync(appPath);
} catch (err) {
  if (err.code === 'EEXIST') {
    logger.info('Directory already exists. Please choose another name for the project.');
  } else {
    logger.info(err);
  }
  process.exit(1);
}

async function setup() {
  try {
    // Clone repo
    logger.info(`Downloading files from repo ${repo}`);
    await runCmd(`git clone --depth 1 ${repo} ${folderName}`);
    logger.info('Cloned successfully.');
    logger.info('');

    // Change directory
    process.chdir(appPath);

    // Install dependencies
    const useYarn = await hasYarn();
    logger.info('Installing dependencies...');
    if (useYarn) {
      await runCmd('yarn install');
    } else {
      await runCmd('npm install');
    }
    logger.info('Dependencies installed successfully.');
    logger.info();

    // Copy envornment variables
    fs.copyFileSync(path.join(appPath, '.env.example'), path.join(appPath, '.env'));
    logger.info('Environment files copied.');

    // Delete .git folder
    await runCmd('npx rimraf ./.git');

    // Remove extra files
    fs.unlinkSync(path.join(appPath, 'CHANGELOG.md'));
    fs.unlinkSync(path.join(appPath, 'CODE_OF_CONDUCT.md'));
    fs.unlinkSync(path.join(appPath, 'CONTRIBUTING.md'));
    fs.unlinkSync(path.join(appPath, 'bin', 'createNodejsApp.js'));
    fs.rmdirSync(path.join(appPath, 'bin'));
    if (!useYarn) {
      fs.unlinkSync(path.join(appPath, 'yarn.lock'));
    }

    logger.info('Installation is now complete!');
    logger.info();

    logger.info('We suggest that you start by typing:');
    logger.info(`    cd ${folderName}`);
    logger.info(useYarn ? '    yarn dev' : '    npm run dev');
    logger.info();
    logger.info('Enjoy your production-ready Node.js app, which already supports a large number of ready-made features!');
    logger.info('Check README.md for more info.');
  } catch (error) {
    logger.info(error);
  }
}

setup();
