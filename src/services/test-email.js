// test-email.js
const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'asharmeraj55@gmail.com', pass: process.env.SMTP_PASS }
});

t.sendMail({ from: 'asharmeraj55@gmail.com', to: 'progaminglegends55@gmail.com', subject: 'test', text: 'test' })
  .then(() => console.log('sent'))
  .catch(err => console.error('failed:', err));