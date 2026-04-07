const express = require('express');
const prisma = require('../lib/prisma');
const { sendRecoverySms } = require('../services/smsService');
const { sendBusinessEmail } = require('../services/emailService');

const router = express.Router();

router.post('/answer', async (req, res) => {
  try {
    const to = req.body.to || req.query.to;
    const from = req.body.from || req.query.from;
    const uuid = req.body.uuid || req.query.uuid;

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
        rawPayload: req.body
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

router.post('/event', async (req, res) => {
  try {
    const uuid = req.body.uuid || req.query.uuid;
    const status = req.body.status || req.query.status;

    await prisma.call.updateMany({
      where: { vonageUuid: uuid },
      data: {
        status: status || 'event_received',
        endedAt: ['completed', 'failed', 'busy', 'timeout'].includes(status)
          ? new Date()
          : undefined,
        rawPayload: req.body
      }
    });

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(200);
  }
});

module.exports = router;