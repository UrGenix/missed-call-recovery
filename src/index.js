require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const voiceRoutes = require('./routes/voice');
const smsRoutes = require('./routes/sms');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Missed call recovery API is running');
});

app.use('/webhooks/voice', voiceRoutes);
app.use('/webhooks/sms', smsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});