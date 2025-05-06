// Combine all resolvers in a single file to be used by Apollo Server

const companyResolvers = require('./company.resolver');
const locationResolvers = require('./location.resolver');

// Merge the resolvers
const resolvers = {
  Query: {
    // Company resolvers
    companies: companyResolvers.Query.companies,
    latestCompanies: companyResolvers.Query.latestCompanies,
    latestCompaniesStats: companyResolvers.Query.latestCompaniesStats,
    company: companyResolvers.Query.company,
    companyStats: companyResolvers.Query.companyStats,
    companyStatsByStatus: companyResolvers.Query.companyStatsByStatus,
    autocomplete: companyResolvers.Query.autocomplete,

    // Location resolvers
    counties: locationResolvers.Query.counties,
    searchCounties: locationResolvers.Query.searchCounties,
    citiesByCounty: locationResolvers.Query.citiesByCounty,
    searchCities: locationResolvers.Query.searchCities,
    location: locationResolvers.Query.location,
    locationVariations: locationResolvers.Query.locationVariations,
  },

  Mutation: {
    exportCompanies: companyResolvers.Mutation.exportCompanies,
    exportLatestCompanies: companyResolvers.Mutation.exportLatestCompanies,
  },

  // Add any additional type resolvers
  Location: locationResolvers.Location || {},
};

module.exports = resolvers;
