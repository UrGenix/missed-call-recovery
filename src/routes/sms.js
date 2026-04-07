const express = require('express');
const prisma = require('../lib/prisma');
const { sendBusinessEmail } = require('../services/emailService');

const router = express.Router();

function normaliseNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

router.all('/inbound', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;

    const rawTo = payload.to || '';
    const rawFrom = payload.msisdn || payload.from || '';
    const text = payload.text || '';

    const to = normaliseNumber(rawTo);
    const from = normaliseNumber(rawFrom);

    console.log('SMS INBOUND PAYLOAD:', payload);
    console.log('NORMALISED SMS TO:', to, 'FROM:', from);

    if (!to || !from) {
      return res.sendStatus(200);
    }

    const business = await prisma.business.findFirst({
      where: {
        recoveryNumber: to,
        active: true
      }
    });

    if (!business) {
      console.log('NO BUSINESS FOUND FOR SMS TO:', to);
      return res.sendStatus(200);
    }

    const lead = await prisma.lead.findFirst({
      where: {
        businessId: business.id,
        callerNumber: from
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!lead) {
      console.log('NO LEAD FOUND FOR SMS FROM:', from);
      return res.sendStatus(200);
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        inboundReply: text,
        replyReceivedAt: new Date(),
        status: 'replied'
      }
    });

    await prisma.messageLog.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        direction: 'inbound',
        fromNumber: from,
        toNumber: to,
        body: text,
        status: 'received',
        rawPayload: payload
      }
    });

    console.log('INBOUND MESSAGE LOG CREATED');

    await sendBusinessEmail({
      to: business.alertEmail,
      subject: `Customer replied for ${business.name}`,
      html: `
        <h2>Customer Reply Received</h2>
        <p><strong>Caller:</strong> ${from}</p>
        <p><strong>Message:</strong> ${text}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error('SMS INBOUND ERROR:', error);
    return res.sendStatus(200);
  }
});

router.all('/status', async (req, res) => {
  try {
    console.log('SMS STATUS PAYLOAD:', req.method === 'GET' ? req.query : req.body);
    return res.sendStatus(200);
  } catch (error) {
    console.error('SMS STATUS ERROR:', error);
    return res.sendStatus(200);
  }
});

module.exports = router;
