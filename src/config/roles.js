const allRoles = {
  user: ['getCompanies', 'getUsers'],
  admin: ['getUsers', 'manageUsers', 'getCompanies', 'manageCompanies'],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

module.exports = {
  roles,
  roleRights,
};
