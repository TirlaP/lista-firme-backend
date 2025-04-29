const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const companyStatSchema = mongoose.Schema(
  {
    stare: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    count: {
      type: Number,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

companyStatSchema.plugin(toJSON);

const CompanyStat = mongoose.model('CompanyStat', companyStatSchema);

module.exports = CompanyStat;
