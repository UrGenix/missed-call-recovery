const express = require('express');
const prisma = require('../lib/prisma');
const { sendBusinessEmail } = require('../services/emailService');

const router = express.Router();

router.all('/inbound', async (req, res) => {
  try {
    const payload = req.method === 'GET' ? req.query : req.body;
    const rawTo = payload.to || '';
    const rawFrom = payload.msisdn || payload.from || '';
    const text = payload.text || '';

    const to = String(rawTo).replace(/\D/g, '');
    const from = String(rawFrom).replace(/\D/g, '');

    const business = await prisma.business.findFirst({
      where: {
        recoveryNumber: to,
        active: true
      }
    });

    if (!business) return res.sendStatus(200);

    const lead = await prisma.lead.findFirst({
      where: {
        businessId: business.id,
        callerNumber: from
      },
      orderBy: { createdAt: 'desc' }
    });

    if (lead) {
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
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error(error);
    return res.sendStatus(200);
  }
});

router.all('/status', async (req, res) => {
  return res.sendStatus(200);
});

module.exports = router;
