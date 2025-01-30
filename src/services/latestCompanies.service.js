const { Company } = require('../models');
const NodeCache = require('node-cache');

class LatestCompaniesService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
    });
  }

  async getLatestCompanies(options) {
    const { timeRange, customStartDate, customEndDate, page = 1, limit = 10 } = options;

    const cacheKey = `latest_companies_${timeRange || 'custom'}_${customStartDate || ''}_${
      customEndDate || ''
    }_${page}_${limit}`;
    let result = this.cache.get(cacheKey);

    if (result) {
      return result;
    }

    try {
      const dateFilter = this._buildDateFilter(timeRange, customStartDate, customEndDate);
      const skip = (page - 1) * limit;

      const pipeline = [
        {
          $addFields: {
            registrationDate: {
              $dateFromString: {
                dateString: '$date_generale.data_inregistrare',
                format: '%Y-%m-%d',
              },
            },
          },
        },
        {
          $match: {
            registrationDate: {
              $gte: dateFilter.$gte,
              $lte: dateFilter.$lte,
            },
          },
        },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            results: [
              { $sort: { registrationDate: -1, cui: 1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  cui: 1,
                  denumire: 1,
                  cod_CAEN: 1,
                  cod_inmatriculare: 1,
                  'adresa_anaf.sediu_social': 1,
                  date_generale: 1,
                  adresa_completa: 1,
                  contact: 1,
                  inregistrare: 1,
                  tip_firma: 1,
                  caen: 1,
                },
              },
            ],
          },
        },
      ];

      const [aggregationResult] = await Company.aggregate(pipeline).allowDiskUse(true);
      const totalCount = aggregationResult.metadata[0]?.total || 0;

      result = {
        results: aggregationResult.results,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalResults: totalCount,
        timeRange: timeRange || 'custom',
        dateRange: {
          from: dateFilter.$gte,
          to: dateFilter.$lte,
        },
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error in getLatestCompanies:', error);
      throw error;
    }
  }

  async getLatestStats(options) {
    const { timeRange, customStartDate, customEndDate } = options;
    const cacheKey = `latest_stats_${timeRange || 'custom'}_${customStartDate || ''}_${customEndDate || ''}`;
    let stats = this.cache.get(cacheKey);

    if (stats) {
      return stats;
    }

    try {
      const dateFilter = this._buildDateFilter(timeRange, customStartDate, customEndDate);

      const pipeline = [
        {
          $addFields: {
            registrationDate: {
              $dateFromString: {
                dateString: '$date_generale.data_inregistrare',
                format: '%Y-%m-%d',
              },
            },
          },
        },
        {
          $match: {
            registrationDate: {
              $gte: dateFilter.$gte,
              $lte: dateFilter.$lte,
            },
          },
        },
        {
          $facet: {
            totalCompanies: [{ $count: 'count' }],
            byCAEN: [
              {
                $group: {
                  _id: '$cod_CAEN',
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            byJudet: [
              {
                $group: {
                  _id: '$adresa_anaf.sediu_social.sdenumire_Judet',
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            byDay: [
              {
                $group: {
                  _id: '$date_generale.data_inregistrare',
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: -1 } },
              { $limit: 7 },
            ],
          },
        },
      ];

      const [result] = await Company.aggregate(pipeline);

      stats = {
        totalNew: result.totalCompanies[0]?.count || 0,
        topCAEN: result.byCAEN,
        topLocations: result.byJudet,
        dailyTrend: result.byDay,
        timeRange: timeRange || 'custom',
        dateRange: {
          from: dateFilter.$gte,
          to: dateFilter.$lte,
        },
      };

      this.cache.set(cacheKey, stats, 1800);
      return stats;
    } catch (error) {
      console.error('Error in getLatestStats:', error);
      throw error;
    }
  }

  _buildDateFilter(timeRange, customStartDate, customEndDate) {
    // If custom dates are provided, use them regardless of timeRange
    if (customStartDate && customEndDate) {
      const startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      return {
        $gte: startDate,
        $lte: endDate,
      };
    }

    // If no custom dates, use timeRange
    const now = new Date();
    let startDate, endDate;

    switch (timeRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date();
        break;
      case 'yesterday':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last7days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last30days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        // Default to last 7 days if no valid timeRange or custom dates
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
    }

    return {
      $gte: startDate,
      $lte: endDate,
    };
  }
}

module.exports = new LatestCompaniesService();
