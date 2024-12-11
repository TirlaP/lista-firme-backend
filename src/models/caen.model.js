const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const caenSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    division_code: {
      type: String,
      required: true,
      index: true,
    },
    division_name: {
      type: String,
      required: true,
    },
    section_code: {
      type: String,
      required: true,
      index: true,
    },
    section_name: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'caen-codes', // Explicitly set collection name
  }
);

// add text indexes
caenSchema.index({
  code: 'text',
  name: 'text',
  division_code: 'text',
  division_name: 'text',
  section_code: 'text',
  section_name: 'text',
});

caenSchema.plugin(toJSON);

/**
 * @typedef CAEN
 */
const CAEN = mongoose.model('CAEN', caenSchema, 'caen-codes');

module.exports = CAEN;
