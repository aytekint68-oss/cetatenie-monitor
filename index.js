import express from "express";
import puppeteer from "puppeteer-core";
import nodemailer from "nodemailer";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 10000;
const TARGET_URL = "https://cetatenie.just.ro/stadiu-dosar/";
const STATE_FILE = "last_link.txt";

// === SMTP ayarlarını buraya gir ===
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "aytekint68@gmail.com",
    pass: "htvt vxtz voxa dghk"
  }
});

async function checkForChange() {
  console.log(`[${new Date().toISOString()}] Kontrol başlıyor...`);

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });

  const link = await page.evaluate(() => {
    const tab = document.querySelector("#articolul-10-tab ul");
    if (!tab) return null;
    const lis = tab.querySelectorAll("li a");
    const last = lis[lis.length - 1];
    return last ? last.href : null;
  });

  await browser.close();

  if (!link) {
    console.log("⚠️ Link bulunamadı!");
    return "Link bulunamadı";
  }

  console.log("Bulunan link:", link);

  let previous = null;
  if (fs.existsSync(STATE_FILE)) previous = fs.readFileSync(STATE_FILE, "utf8");

  if (previous !== link) {
    fs.writeFileSync(STATE_FILE, link);
    console.log("🚨 Değişiklik tespit edildi!");
    await sendMail(link);
    return `Değişiklik bulundu: ${link}`;
  } else {
    console.log("✅ Değişiklik yok.");
    return "Değişiklik yok.";
  }
}

async function sendMail(link) {
  const info = await transporter.sendMail({
    from: '"Cetatenie Checker" <aytekint68@gmail.com>',
    to: "aytekint@hotmail.com",
    subject: "Cetatenie Link Değişikliği!",
    html: `<p>Yeni link tespit edildi:</p><p><a href="${link}">${link}</a></p>`
  });
  console.log("📧 E-posta gönderildi:", info.messageId);
}

// === HTTP endpoint ===
app.get("/run", async (req, res) => {
  try {
    const result = await checkForChange();
    res.send(result);
  } catch (err) {
    console.error("Hata:", err);
    res.status(500).send("Hata: " + err.message);
  }
});

app.listen(PORT, () => console.log(`✅ Server çalışıyor: ${PORT}`));

