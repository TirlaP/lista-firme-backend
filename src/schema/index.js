const { gql } = require('apollo-server-express');
const fs = require('fs');
const path = require('path');

// Function to read all .graphql files from a directory
const loadGraphQLFilesFromDir = (dirPath) => {
  let typeDefs = '';

  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    if (file.endsWith('.graphql')) {
      const filePath = path.join(dirPath, file);
      typeDefs += fs.readFileSync(filePath, 'utf8') + '\n';
    }
  });

  return typeDefs;
};

// Load all GraphQL schema files
const loadAllSchemaFiles = () => {
  let typeDefs = '';

  // Load scalar definitions
  typeDefs += fs.readFileSync(path.join(__dirname, 'scalar.graphql'), 'utf8') + '\n';

  // Load enum definitions
  typeDefs += fs.readFileSync(path.join(__dirname, 'enums.graphql'), 'utf8') + '\n';

  // Load type definitions
  typeDefs += loadGraphQLFilesFromDir(path.join(__dirname, 'types')) + '\n';

  // Load input definitions
  typeDefs += loadGraphQLFilesFromDir(path.join(__dirname, 'inputs')) + '\n';

  // Load query and mutation definitions
  typeDefs += fs.readFileSync(path.join(__dirname, 'queries.graphql'), 'utf8') + '\n';
  typeDefs += fs.readFileSync(path.join(__dirname, 'mutations.graphql'), 'utf8') + '\n';

  return gql(typeDefs);
};

const typeDefs = loadAllSchemaFiles();

module.exports = typeDefs;
