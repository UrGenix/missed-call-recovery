const express = require('express');
const prisma = require('../lib/prisma');
const { sendRecoverySms } = require('../services/smsService');
const { sendBusinessEmail } = require('../services/emailService');

const router = express.Router();

function normaliseNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

router.all('/answer', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;

    const rawTo = payload.to || '';
    const rawFrom = payload.from || '';
    const uuid = payload.uuid || payload.conversation_uuid || '';

    const to = normaliseNumber(rawTo);
    const from = normaliseNumber(rawFrom);

    console.log('VOICE ANSWER PAYLOAD:', payload);
    console.log('NORMALISED TO:', to, 'FROM:', from, 'UUID:', uuid);

    if (!to || !from) {
      return res.json([
        {
          action: 'talk',
          text: 'Webhook is live.'
        }
      ]);
    }

    const business = await prisma.business.findFirst({
      where: {
        recoveryNumber: to,
        active: true
      }
    });

    if (!business) {
      console.log('NO BUSINESS FOUND FOR:', to);
      return res.json([
        {
          action: 'talk',
          text: 'This service is unavailable.'
        }
      ]);
    }

    // Return NCCO immediately so Vonage gets a fast response
    res.json([
      {
        action: 'talk',
        text: 'Sorry we missed your call. We will text you now.'
      }
    ]);

    // Process in background after responding
    setImmediate(async () => {
      try {
        let call = null;

        if (uuid) {
          call = await prisma.call.findFirst({
            where: { vonageUuid: uuid }
          });
        }

        if (!call) {
          call = await prisma.call.create({
            data: {
              businessId: business.id,
              vonageUuid: uuid || null,
              callerNumber: from,
              calledNumber: to,
              status: 'diverted_to_recovery',
              rawPayload: payload
            }
          });
        }

        let lead = await prisma.lead.findFirst({
          where: { callId: call.id }
        });

        if (!lead) {
          lead = await prisma.lead.create({
            data: {
              businessId: business.id,
              callId: call.id,
              callerNumber: from,
              status: 'new'
            }
          });
        }

        // Only send one SMS per lead/call
        if (!lead.firstSmsSentAt) {
          await sendRecoverySms({
            businessId: business.id,
            leadId: lead.id,
            to: from,
            from: business.recoveryNumber,
            text: business.smsTemplate
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { firstSmsSentAt: new Date() }
          });

          await sendBusinessEmail({
            to: business.alertEmail,
            subject: `New lead for ${business.name}`,
            html: `
              <h2>New Lead Captured</h2>
              <p><strong>Caller:</strong> ${from}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Status:</strong> Missed call recovered</p>
            `
          });
        }
      } catch (bgError) {
        console.error('VOICE ANSWER BACKGROUND ERROR:', bgError);
      }
    });
  } catch (error) {
    console.error('VOICE ANSWER ERROR:', error);
    return res.json([
      {
        action: 'talk',
        text: 'Sorry, something went wrong.'
      }
    ]);
  }
});

router.all('/event', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;
    const uuid = payload.uuid || payload.conversation_uuid || '';
    const status = payload.status || payload.call_status || 'event_received';

    console.log('VOICE EVENT PAYLOAD:', payload);

    if (uuid) {
      await prisma.call.updateMany({
        where: { vonageUuid: uuid },
        data: {
          status,
          endedAt: ['completed', 'failed', 'busy', 'timeout', 'rejected'].includes(status)
            ? new Date()
            : undefined,
          rawPayload: payload
        }
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('VOICE EVENT ERROR:', error);
    return res.sendStatus(200);
  }
});

module.exports = router;
