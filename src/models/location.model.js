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
    type: {
      type: String,
      enum: ['county', 'city', 'municipality', 'sector'], // Added 'sector' for Bucharest
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    countyCode: {
      type: String,
      required: function () {
        return this.type === 'city' || this.type === 'municipality' || this.type === 'sector';
      },
      trim: true,
      index: true,
    },
    standardizedNames: [
      {
        type: String,
        trim: true,
      },
    ],
    aliases: [
      {
        type: String,
        trim: true,
      },
    ],
    population: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better query performance
locationSchema.index({ name: 1, type: 1 });
locationSchema.index({ countyCode: 1, type: 1 });
locationSchema.index({ standardizedNames: 1, type: 1 });
locationSchema.index({ aliases: 1, type: 1 });
locationSchema.index({ isActive: 1, type: 1 });

// Text index for search functionality
locationSchema.index(
  { name: 'text', standardizedNames: 'text', aliases: 'text' },
  {
    weights: {
      name: 10,
      standardizedNames: 5,
      aliases: 3,
    },
    name: 'location_text_search',
  }
);

// Add unique compound index to prevent duplicate cities within a county
locationSchema.index(
  { countyCode: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: { $in: ['city', 'municipality', 'sector'] },
    },
  }
);

locationSchema.plugin(toJSON);

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
