// src/apollo/server.js
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const logger = require('../config/logger');

// Read schema from file
const schemaPath = path.join(__dirname, '../schema/schema.graphql');
const typeDefs = fs.readFileSync(schemaPath, 'utf-8');

const verifyAccessToken = async (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== tokenTypes.ACCESS) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
    }
    return payload;
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid access token');
  }
};

const createApolloServer = async (app) => {
  const server = new ApolloServer({
    typeDefs,
    resolvers: require('../resolvers/company.resolver'),
    introspection: true,
    cache: 'bounded',
    formatError: (error) => {
      logger.error('GraphQL Error:', error);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
      };
    },
  });

  await server.start();

  // Create a separate router for GraphQL
  const graphqlRouter = express.Router();

  // Add GraphQL middleware
  graphqlRouter.use(
    '/',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        try {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
          }

          const token = authHeader.substring(7);
          const payload = await verifyAccessToken(token);

          return {
            user: { id: payload.sub },
            token,
          };
        } catch (error) {
          throw new ApiError(error.statusCode || httpStatus.UNAUTHORIZED, error.message || 'Please authenticate');
        }
      },
    })
  );

  // Mount the GraphQL router
  app.use('/v1/graphql', graphqlRouter);

  return server;
};

module.exports = createApolloServer;
