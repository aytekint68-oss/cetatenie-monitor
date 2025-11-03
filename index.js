// index.js
import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';

const app = express();
app.use(bodyParser.json());

const DATA_FILE = process.env.DATA_FILE || 'last_link.txt';
const TARGET_URL = process.env.TARGET_URL || 'https://cetatenie.just.ro/stadiu-dosar/';

// SMTP config from env
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || 'aytekint68@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'htvt vxtz voxa dghk';
const MAIL_TO   = process.env.MAIL_TO || 'aytekint@hotmail.com'; // comma separated list allowed

// Helper: send email
async function sendMail(newLink) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const html = `<p>Yeni link bulundu: <a href="${newLink}" target="_blank">${newLink}</a></p>`;
  const info = await transporter.sendMail({
    from: `"Dosar Takip" <${SMTP_USER}>`,
    to: MAIL_TO,
    subject: 'Cetatenie – Yeni Link Yayınlandı',
    html: html
  });

  return info;
}

// Main check function
async function checkAndNotify() {
  console.log(`[${new Date().toISOString()}] Başlıyor: ${TARGET_URL}`);

  // Launch puppeteer
  // Use no-sandbox flags which are commonly required on PaaS
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  try {
    const page = await browser.newPage();
    // Set a reasonable timeout
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // try to get the last link inside #articolul-10-tab
    const lastLink = await page.$$eval('#articolul-10-tab ul li a', anchors => {
      if (!anchors || anchors.length === 0) return null;
      return anchors[anchors.length - 1].href;
    });

    if (!lastLink) {
      console.log('İstenen selector bulunamadı veya link yok.');
      return { changed: false, message: 'selector_not_found' };
    }

    // read old link
    let oldLink = '';
    if (fs.existsSync(DATA_FILE)) {
      oldLink = fs.readFileSync(DATA_FILE, 'utf-8').trim();
    }

    if (lastLink !== oldLink) {
      // store new
      fs.writeFileSync(DATA_FILE, lastLink, 'utf-8');
      console.log('Değişiklik tespit edildi:', lastLink);

      // send email
      if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) {
        console.log('E-posta gönderimi için SMTP bilgileri veya alıcı adresi ayarlı değil.');
        return { changed: true, newLink: lastLink, emailSent: false };
      }

      const info = await sendMail(lastLink);
      console.log('E-posta gönderildi:', info.messageId);
      return { changed: true, newLink: lastLink, emailSent: true, info: info };
    } else {
      console.log('Değişiklik yok.');
      return { changed: false, message: 'same' };
    }
  } catch (err) {
    console.error('Hata:', err && err.message ? err.message : err);
    throw err;
  } finally {
    await browser.close();
  }
}

// HTTP endpoint that triggers the check
app.get('/run', async (req, res) => {
  try {
    const result = await checkAndNotify();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Basic health endpoint
app.get('/', (req, res) => {
  res.send('Cetatenie monitor service is running.');
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
