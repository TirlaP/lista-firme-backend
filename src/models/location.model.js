const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const locationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    county_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    county_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    parent_name: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    parent_code: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    is_county: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better query performance
locationSchema.index({ county_code: 1, name: 1 });
locationSchema.index({ parent_code: 1 });

// Text index for search functionality
locationSchema.index(
  { name: 'text', full_name: 'text', standardizedNames: 'text', aliases: 'text' },
  {
    weights: {
      name: 10,
      full_name: 8,
      standardizedNames: 5,
      aliases: 3,
    },
    name: 'location_text_search',
  }
);

locationSchema.plugin(toJSON);

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
