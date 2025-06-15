const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const axios = require("axios");
const twilio = require("twilio");

admin.initializeApp();
const bucket = admin.storage().bucket();
const db = admin.firestore();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/quicktime'
];

function classifyFile(mimeType) {
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType === "application/pdf") return "documents";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "videos";
  return "others";
}

function isSupportedFileType(mimeType) {
  return SUPPORTED_MIME_TYPES.includes(mimeType);
}

async function handleFileUpload(from, mediaUrl, mediaType, body, twiml) {
  if (!mediaUrl || !mediaType) {
    twiml.message("⚠️ Gagal membaca media. Coba lagi.");
    return;
  }

  // Check for unsupported file type
  if (!isSupportedFileType(mediaType)) {
    twiml.message(`⚠️ Jenis file ${mediaType} tidak didukung. Format yang didukung: ${SUPPORTED_MIME_TYPES.join(', ')}`);
    return;
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = {
      headers: {
        Authorization: "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
      },
      responseType: "stream",
    };

    // Check file size
    const headResponse = await axios.head(mediaUrl, authHeader);
    const contentLength = headResponse.headers['content-length'];
    
    if (contentLength > MAX_FILE_SIZE) {
      twiml.message(`⚠️ File terlalu besar (${Math.round(contentLength/1024/1024)}MB). Maksimal ${MAX_FILE_SIZE/1024/1024}MB.`);
      return;
    }

    const fileExt = mediaType.split("/")[1] || "bin";
    const folder = classifyFile(mediaType);
    const timestamp = Date.now();
    const filePath = `${folder}/${timestamp}_${from.replace(":", "_")}.${fileExt}`;

    const response = await axios.get(mediaUrl, authHeader);
    const file = bucket.file(filePath);

    await new Promise((resolve, reject) => {
      const writeStream = file.createWriteStream({ metadata: { contentType: mediaType } });
      response.data.pipe(writeStream).on("finish", resolve).on("error", reject);
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await db.collection("messages").add({
      sender: from,
      filePath,
      mediaUrl,
      mediaType,
      downloadUrl: publicUrl,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      textContent: body !== "(no-text)" ? body : null,
      fileSize: contentLength,
    });

    twiml.message(
      `✅ File berhasil disimpan!\n` +
      `📂 Kategori: ${folder}\n` +
      `📄 Tipe: ${mediaType}\n` +
      `📏 Ukuran: ${Math.round(contentLength/1024)}KB\n` +
      `🔗 Link: ${publicUrl}\n` +
      `📝 Catatan: ${body !== "(no-text)" ? body : "Tidak ada teks"}`
    );
  } catch (error) {
    console.error("Upload error:", error);
    twiml.message("❌ Gagal mengupload file. Silakan coba lagi.");
  }
}

async function handleMessage(req, twiml) {
  const from = req.body.From;
  const body = (req.body.Body || "").trim().toLowerCase();
  const numMedia = parseInt(req.body.NumMedia || "0");

  console.log(`📩 Pesan dari ${from}: "${body}" (${numMedia} media)`);

  // Handle test commands
  if (body.startsWith("test")) {
    const testType = body.split(" ")[1];
    switch(testType) {
      case "ping":
        twiml.message("🏓 Pong! Status server menyala.");
        break;
      case "echo":
        const echoText = body.substring(10) || "(no text)";
        twiml.message(`🔊 Echo: ${echoText}`);
        break;
      case "time":
        twiml.message(`⏰ Waktu server: ${new Date().toISOString()}`);
        break;
      case "help":
        twiml.message(
          "🛠️ Perintah yang tersedia:\n" +
          "- test ping\n" +
          "- test echo [text]\n" +
          "- test time\n" +
          "- test help\n" +
          "- test status\n" +
          "Atau kirim file untuk menguploadnya."
        );
        break;
      case "status":
        try {
          const docCount = (await db.collection("messages").count().get()).data().count;
          twiml.message(`✅ System OK\n📊 Total file yang diupload: ${docCount}`);
        } catch (error) {
          twiml.message("⚠️ Kesalahan saat cek status database");
        }
        break;
      default:
        twiml.message("❌ Perintah tidak dikenali. Coba 'test help'");
    }
    return;
  }

  // Handle media uploads
  if (numMedia > 0) {
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const mediaType = req.body[`MediaContentType${i}`];
      await handleFileUpload(from, mediaUrl, mediaType, body, twiml);
    }
    return;
  }

  // Handle text-only messages
  const responses = [
    "Halo! Kirimkan file dan saya akan menyimpannya ke cloud ☁️📁",
    "Coba kirim foto, dokumen, atau file audio!",
    "Gunakan 'test help' untuk melihat perintah yang tersedia",
    "Apa kabar? Saya siap menerima file Anda!",
    "File yang Anda kirim akan disimpan secara aman di Google Cloud"
  ];
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  twiml.message(randomResponse);
}

app.post("/", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  
  try {
    await handleMessage(req, twiml);
  } catch (error) {
    console.error("❌ Error:", error);
    twiml.message("❌ Maaf, terjadi kesalahan saat memproses pesanmu.");
  }

  res.type("text/xml").send(twiml.toString());
});

exports.waBot = onRequest(
  {
    secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    region: "us-central1",
  },
  app
);