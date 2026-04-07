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
          console.error('SMS SEND ERROR:', err);
          reject(err);
          return;
        }

        console.log('SMS SEND RESPONSE:', responseData);

        try {
          await prisma.messageLog.create({
            data: {
              businessId,
              leadId,
              direction: 'outbound',
              fromNumber: String(from || ''),
              toNumber: String(to || ''),
              body: text,
              status: 'sent',
              rawPayload: responseData
            }
          });

          console.log('OUTBOUND MESSAGE LOG CREATED');
          resolve(responseData);
        } catch (dbErr) {
          console.error('MESSAGE LOG DB ERROR:', dbErr);
          reject(dbErr);
        }
      }
    );
  });
}

module.exports = { sendRecoverySms };
