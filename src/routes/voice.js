const express = require('express');
const prisma = require('../lib/prisma');
const { sendRecoverySms } = require('../services/smsService');
const { sendBusinessEmail } = require('../services/emailService');

const router = express.Router();

router.all('/answer', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;

    const to = payload.to;
    const from = payload.from;
    const uuid = payload.uuid;

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
      return res.json([
        { action: 'talk', text: 'This service is unavailable.' }
      ]);
    }

    const call = await prisma.call.create({
      data: {
        businessId: business.id,
        vonageUuid: uuid,
        callerNumber: from,
        calledNumber: to,
        status: 'diverted_to_recovery',
        rawPayload: payload
      }
    });

    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        callId: call.id,
        callerNumber: from,
        status: 'new'
      }
    });

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

    return res.json([
      {
        action: 'talk',
        text: 'Sorry we missed your call. We have sent you a text message now.'
      }
    ]);
  } catch (error) {
    console.error(error);
    return res.json([
      { action: 'talk', text: 'Sorry, something went wrong.' }
    ]);
  }
});

router.all('/event', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;
    const uuid = payload.uuid;
    const status = payload.status;

    await prisma.call.updateMany({
      where: { vonageUuid: uuid },
      data: {
        status: status || 'event_received',
        endedAt: ['completed', 'failed', 'busy', 'timeout'].includes(status)
          ? new Date()
          : undefined,
        rawPayload: payload
      }
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error(error);
    return res.sendStatus(200);
  }
});

module.exports = router;
