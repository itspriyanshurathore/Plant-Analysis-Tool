const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Multer Config
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Middleware
app.use(express.static(path.join(__dirname, "public")));

// Home Page route
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
//! ---------------------------------Routes----------------------------------------------------- 
// ---- Analyze Route ----
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, {
      encoding: "base64",
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const result = await model.generateContent([
      `You are an expert botanist and plant care assistant.

  Analyze the uploaded plant image carefully and provide a natural, human-readable description of it.

  Format the output in plain text (NO markdown, NO symbols like ### or **).

  The output should follow this clear structure:

  1. Plant Name: (Write the common name)
  2. Scientific Name: (Write the scientific name in italics)
  3. Description: Write 3–5 lines describing the plant’s appearance (leaves, color, size, and general traits).
  4. Ideal Weather & Environment: Describe the type of climate or weather this plant thrives in (temperature, humidity, etc.).
  5. Best Growing Conditions:
     - Light: (Mention light requirements)
     - Watering: (Mention watering frequency and style)
     - Soil: (Mention the suitable soil type)
     - Humidity: (Mention preferred humidity)
  6. Summary: A short summary (2–3 lines) giving care tips and how this plant can be best maintained at home.

  Make the response simple, elegant, and written like you’re explaining to a beginner plant lover.`,
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    const response = await result.response;
    // console.log("✅ Gemini raw output:", JSON.stringify(response, null, 2));

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

    await fsPromises.unlink(imagePath);

    res.json({
      success: true,
      results: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    console.error("❌ Error analyzing plant:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- Download PDF Route ----
app.post("/download", async (req, res) => {
  try {
    console.log("📥 Received PDF generation request");
    const { results, image } = req.body;

    if (!results) {
      return res.status(400).json({ error: "No analysis data provided" });
    }

    const doc = new PDFDocument({ margin: 50 });
    const filePath = path.join("output", `Plant_Report_${Date.now()}.pdf`);

    // Ensure output folder exists
    if (!fs.existsSync("output")) fs.mkdirSync("output");

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // --- 🖼️ Image at the top (centered)
    try {
      if (image) {
        let imageBuffer = null;
        if (image.startsWith("data:image")) {
          imageBuffer = Buffer.from(image.split(",")[1], "base64");
        } else if (image.startsWith("http")) {
          const imgRes = await fetch(image);
          imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        }

        if (imageBuffer) {
          const imgWidth = 350;
          const imgHeight = 120;
          const xPos = (doc.page.width - imgWidth) / 2;

          doc.image(imageBuffer, xPos, 50, {
            width: imgWidth,
            height: imgHeight,
          });
          doc.moveDown(5); // add spacing after image
        }
      }
    } catch (err) {
      console.log("⚠️ Image load error:", err.message);
    }

    // --- 🌿 Centered Heading
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

    // --- ✍️ Analysis Content Formatting
    const lines = results.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      if (line.includes(":")) {
        const [heading, ...descParts] = line.split(":");
        const desc = descParts.join(":").trim();

        // Heading (bold)
        doc
          .moveDown(0.5)
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#1b4332")
          .text(`${heading.trim()}:`, { continued: false });

        // Description (normal text)
        doc.font("Helvetica").fontSize(12).fillColor("#333").text(desc, {
          align: "justify",
          lineGap: 6,
          paragraphGap: 10,
        });
      } else {
        doc
          .font("Helvetica")
          .fontSize(12)
          .fillColor("#333")
          .text(line, { align: "justify", lineGap: 6 });
      }
    }

    // ✅ Finalize PDF
    doc.end();

    writeStream.on("finish", () => {
      console.log("✅ PDF created:", filePath);
      res.download(filePath, "Plant_Analysis_Report.pdf", (err) => {
        if (!err) fs.unlinkSync(filePath);
      });
    });

    writeStream.on("error", (err) => {
      console.error("🛑 WriteStream error:", err);
      res.status(500).json({ error: "File writing error" });
    });
  } catch (err) {
    console.error("❌ PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

// ---- Start Server ----
app.listen(port, () => {
  console.log(`🌱 PlantScan running at http://localhost:${port}`);
});
