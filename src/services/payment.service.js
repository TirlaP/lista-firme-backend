// src/services/payment.service.js
const fs = require('fs');
const path = require('path');
const { Netopia } = require('netopia-card');
const logger = require('../config/logger');

class PaymentService {
  constructor() {
    if (!process.env.NETOPIA_API_KEY || !process.env.NETOPIA_SIGNATURE) {
      throw new Error('NETOPIA_API_KEY and NETOPIA_SIGNATURE are required');
    }

    // Load certificate files - adjust paths as needed
    this.privateKey = fs.readFileSync(path.resolve(__dirname, '../../private-key-sandbox.key'), 'utf8');

    this.publicCert = fs.readFileSync(path.resolve(__dirname, '../../public-key-sandbox.cer'), 'utf8');

    // logger.info('process.env.NETOPIA_API_KEY', process.env.NETOPIA_API_KEY);
    // logger.info('process.env.NETOPIA_SIGNATURE', process.env.NETOPIA_SIGNATURE);
    // logger.info('this.privateKey', this.privateKey);
    // logger.info('this.publicCert', this.publicCert);

    // Force sandbox mode
    this.netopia = new Netopia({
      apiKey: process.env.NETOPIA_API_KEY,
      posSignature: process.env.NETOPIA_SIGNATURE,
      privateKey: this.privateKey,
      publicCert: this.publicCert,
      notifyUrl: process.env.NETOPIA_CONFIRM_URL,
      redirectUrl: process.env.NETOPIA_RETURN_URL,
      sandbox: true, // Force sandbox mode
      language: 'ro', // Required field
    });
  }

  async initializePayment(paymentData) {
    try {
      // Add validation for phone number
      if (!paymentData.billing.phone) {
        throw new Error('Phone number is required');
      }

      // Add mandatory order fields
      this.netopia.setOrderData({
        amount: paymentData.amount,
        orderID: paymentData.orderId,
        currency: 'RON',
        description: `Subscription payment for order ${paymentData.orderId}`,
        dateTime: new Date().toISOString(),
        billing: {
          ...paymentData.billing,
          city: paymentData.billing.city || 'Bucharest',
          country: 642, // Romania country code
          countryName: 'Romania',
          postalCode: paymentData.billing.postalCode || '123456',
          details: 'Subscription payment',
        },
      });

      // Set browser data with realistic values
      this.netopia.setBrowserData(
        {
          BROWSER_COLOR_DEPTH: '24',
          BROWSER_JAVA_ENABLED: 'false',
          BROWSER_LANGUAGE: 'ro-RO',
          BROWSER_SCREEN_HEIGHT: '1080',
          BROWSER_SCREEN_WIDTH: '1920',
          BROWSER_TZ: 'Europe/Bucharest',
          BROWSER_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          BROWSER_TZ_OFFSET: '-120',
          MOBILE: 'false',
          SCREEN_POINT: 'false',
          OS: 'Windows',
          OS_VERSION: '10',
          BROWSER_PLUGINS: '',
        },
        '127.0.0.1' // Replace with real IP in production
      );

      // Start payment process
      const response = await this.netopia.startPayment();

      logger.info(`Payment initialized for order ${paymentData.orderId}`);
      return {
        paymentUrl: response.url,
        transactionId: response.transactionId,
      };
    } catch (error) {
      logger.error('Payment initialization failed:', {
        error: error.message,
        stack: error.stack,
        paymentData,
      });

      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  async validatePaymentNotification(notificationData) {
    try {
      const isValid = await this.netopia.validateNotification(notificationData);

      if (!isValid) {
        logger.warn('Invalid payment notification:', notificationData);
        return false;
      }

      return JSON.parse(notificationData);
    } catch (error) {
      logger.error('Notification validation error:', error);
      return false;
    }
  }
}

module.exports = new PaymentService();
