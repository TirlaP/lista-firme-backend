const { Client } = require('pg');
const mongoose = require('mongoose');
require('dotenv').config();

const pgConfig = {
  user: 'postgres',
  host: 'lista-firme-postgres.cjk0ak0gyv0p.us-east-1.rds.amazonaws.com',
  database: 'postgres',
  password: 'C6779d3cc6779d3c!',
  port: 5432,
  // Add connection timeout
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
};

async function testConnection() {
  const client = new Client(pgConfig);

  try {
    console.log('Attempting to connect to PostgreSQL...');
    await client.connect();
    console.log('Successfully connected to PostgreSQL!');

    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('Test query result:', result.rows[0]);
  } catch (error) {
    console.error('Connection error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });
  } finally {
    await client.end();
  }
}

testConnection();
