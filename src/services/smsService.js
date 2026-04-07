const { Vonage } = require('@vonage/server-sdk');
const prisma = require('../lib/prisma');

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
});

async function sendRecoverySms({ businessId, leadId, to, from, text }) {
  return new Promise((resolve, reject) => {
    vonage.sms.send(
      { to, from, text },
      async (err, responseData) => {
        if (err) {
          console.error('SMS send error:', err);
          reject(err);
          return;
        }

        try {
          await prisma.messageLog.create({
            data: {
              businessId,
              leadId,
              direction: 'outbound',
              fromNumber: from,
              toNumber: to,
              body: text,
              status: 'sent',
              rawPayload: responseData
            }
          });

          resolve(responseData);
        } catch (dbErr) {
          reject(dbErr);
        }
      }
    );
  });
}

module.exports = { sendRecoverySms };