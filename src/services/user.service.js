const httpStatus = require('http-status');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const bcrypt = require('bcryptjs');

/**
 * Create a user
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: userBody.email },
  });

  if (existingUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  const hashedPassword = await bcrypt.hash(userBody.password, 8);
  return prisma.user.create({
    data: {
      ...userBody,
      password: hashedPassword,
    },
  });
};

/**
 * Query for users
 * @param {Object} filter - Prisma filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const offset = (page - 1) * limit;

  // Convert filter to Prisma format
  const where = {};
  if (filter.name) {
    where.name = { contains: filter.name, mode: 'insensitive' };
  }
  if (filter.role) {
    where.role = filter.role;
  }
  if (filter.isEmailVerified !== undefined) {
    where.isEmailVerified = filter.isEmailVerified;
  }

  // Handle sorting
  let orderBy = { createdAt: 'desc' };
  if (options.sortBy) {
    const [field, order] = options.sortBy.split(':');
    orderBy = { [field]: order };
  }

  const [users, totalResults] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    results: users,
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit),
    totalResults,
  };
};

/**
 * Get user by id
 * @param {number} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return prisma.user.findUnique({
    where: { id: parseInt(id) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

/**
 * Update user by id
 * @param {number} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (updateBody.email) {
    const emailTaken = await prisma.user.findFirst({
      where: {
        email: updateBody.email,
        id: { not: userId },
      },
    });
    if (emailTaken) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }
  }

  if (updateBody.password) {
    updateBody.password = await bcrypt.hash(updateBody.password, 8);
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateBody,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

/**
 * Delete user by id
 * @param {number} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return user;
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
};
