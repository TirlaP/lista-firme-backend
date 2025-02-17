// src/apollo/client.ts
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { toast } from 'react-toastify';
import logger from '../config/logger';

const httpLink = createHttpLink({
  uri: `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/v1/graphql`,
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('accessToken');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, extensions }) => {
      logger.error(`[GraphQL error]: Message: ${message}, Code: ${extensions?.code}`);

      if (extensions?.code === 'UNAUTHENTICATED' || message.includes('authenticate')) {
        // Handle authentication errors
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      } else {
        // Show error message to user
        toast.error(message);
      }
    });
  }

  if (networkError) {
    logger.error(`[Network error]: ${networkError}`);
    toast.error('Network error occurred. Please try again.');
  }
});

export const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          companies: {
            keyArgs: ['input'],
            merge(existing, incoming, { args }) {
              if (!existing) return incoming;
              if (args?.input?.after) {
                return {
                  ...incoming,
                  edges: [...existing.edges, ...incoming.edges],
                };
              }
              return incoming;
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});
