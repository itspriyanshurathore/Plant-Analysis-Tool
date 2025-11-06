require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cors = require("cors");
const sharp = require("sharp"); 

const app = express();

// ✅ In-memory multer storage (no upload folders)
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// 🌍 Home Route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🧠 Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🌿 Analyze Route
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const imageData = req.file.buffer.toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const result = await model.generateContent([
      `You are an expert botanist and plant care assistant.
      Analyze the uploaded plant image carefully and provide a natural, human-readable description of it.
      Format the output in plain text (NO markdown, NO symbols like ### or **).
      The output should follow this clear structure:
      1. Plant Name
      2. Scientific Name
      3. Description
      4. Ideal Weather & Environment
      5. Best Growing Conditions
      6. Summary (short care tips)`,
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    const response = result.response;
    let plantInfo = "";

    if (response && typeof response.text === "function") {
      plantInfo = response.text();
    } else if (response.candidates && response.candidates.length > 0) {
      plantInfo = response.candidates[0].content.parts
        .map((p) => p.text || "")
        .join("\n");
    } else {
      plantInfo = "No analysis found.";
    }

    res.json({
      success: true,
      results: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    console.error("❌ Analyze Error:", error);
    res.status(500).json({ error: "Error analyzing plant image." });
  }
});

// 📄 Download PDF Route (Sharp Fix + Cross-Platform)
app.post("/download", async (req, res) => {
  try {
    const { results, image } = req.body;
    if (!results) return res.status(400).json({ error: "No analysis data provided" });

    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    // Collect PDF in memory
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="Plant_Analysis_Report.pdf"'
      );
      res.send(pdfBuffer);
    });

    // 🖼️ Add image safely (Sharp conversion fix)
    try {
      if (image && image.startsWith("data:image")) {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        let imgBuffer = Buffer.from(base64Data, "base64");

        // ✅ Convert to PNG using Sharp (handles any format)
        imgBuffer = await sharp(imgBuffer).png().toBuffer();

        // ✅ Use system temporary folder
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, "temp-plant-image.png");

        fs.writeFileSync(tempFile, imgBuffer);

        const imgWidth = 350;
        const imgHeight = 120;
        const xPos = (doc.page.width - imgWidth) / 2;

        doc.image(tempFile, xPos, 50, {
          width: imgWidth,
          height: imgHeight,
        });

        fs.unlinkSync(tempFile); // Clean up
        doc.moveDown(5);
      }
    } catch (imgErr) {
      console.warn("⚠️ Image load error:", imgErr.message);
    }

    // 🌿 Add report heading
    doc
      .moveDown(8)
      .fontSize(26)
      .fillColor("#2d6a4f")
      .font("Helvetica-Bold")
      .text("Plant Analysis Report", {
        align: "center",
        underline: true,
      })
      .moveDown(2);

    // ✍️ Add content
    const lines = results.split("\n").filter((line) => line.trim() !== "");
    for (const line of lines) {
      if (line.includes(":")) {
        const [heading, ...descParts] = line.split(":");
        const desc = descParts.join(":").trim();

        doc
          .moveDown(0.5)
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#1b4332")
          .text(`${heading.trim()}:`, { continued: false });

        doc.font("Helvetica").fontSize(12).fillColor("#333").text(desc, {
          align: "justify",
          lineGap: 6,
        });
      } else {
        doc
          .font("Helvetica")
          .fontSize(12)
          .fillColor("#333")
          .text(line, { align: "justify", lineGap: 6 });
      }
    }

    doc.end();
  } catch (err) {
    console.error("❌ PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

// 🟢 Local Development Server
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`🌱 Local server running on port ${port}`));
}

// ✅ Export for Vercel
module.exports = app;
