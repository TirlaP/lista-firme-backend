const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const roleSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: [String],
    limits: {
      companiesPerDay: {
        type: Number,
        default: 10,
      },
      exportsPerDay: {
        type: Number,
        default: 0,
      },
      maxExportRecords: {
        type: Number,
        default: 100,
      },
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

roleSchema.plugin(toJSON);
roleSchema.plugin(paginate); // Added the paginate plugin

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
