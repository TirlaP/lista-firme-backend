const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

// Import the combined schema from our new modular structure
const typeDefs = require('../schema');

const verifyAccessToken = async (token) => {
  try {
    if (!token) throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
    const payload = jwt.verify(token, config.jwt.secret);
    return payload;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid access token');
    throw error;
  }
};

const createApolloServer = async (app) => {
  const server = new ApolloServer({
    typeDefs,
    resolvers: require('../resolvers/index'),
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

  const graphqlRouter = express.Router();

  graphqlRouter.use(
    '/',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        try {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) return { user: null };
          const token = authHeader.substring(7);
          const payload = await verifyAccessToken(token);
          return { user: { id: payload.sub }, token };
        } catch (error) {
          logger.error('Auth error in GraphQL context:', error);
          return { user: null };
        }
      },
    })
  );

  app.use('/v1/graphql', graphqlRouter);
  return server;
};

module.exports = createApolloServer;
