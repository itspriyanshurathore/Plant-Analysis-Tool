let selectedFile = null;

// DOM elements
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const uploadBox = document.getElementById("upload-box");
const uploadLabel = document.getElementById("upload-label");
const analyzeBtn = document.getElementById("analyzeBtn");
const loadingText = document.getElementById("loadingText");
const resultSection = document.getElementById("resultSection");
const resultContent = document.getElementById("resultContent");
const downloadBtn = document.getElementById("downloadBtn");

// --- File selection handler ---
fileInput.addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  if (selectedFile && selectedFile.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(selectedFile);
  }
});

// --- Drag and Drop functionality ---
["dragenter", "dragover"].forEach((eventName) => {
  uploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadBox.classList.add("drag-over");
    uploadLabel.textContent = "🌿Drop your image here";
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadBox.classList.remove("drag-over");
    uploadLabel.textContent = "📸 Click or Drag to Upload";
  });
});

uploadBox.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  } else {
    alert("Please drop a valid image file.");
  }
});

// --- Analyze Button ---
analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) return alert("Please upload an image first!");
  analyzeBtn.style.display = "none";
  loadingText.style.display = "block";

  const formData = new FormData();
  formData.append("image", selectedFile);

  try {
    const res = await fetch("/analyze", { method: "POST", body: formData });
    const data = await res.json();

    loadingText.style.display = "none";
    analyzeBtn.style.display = "inline-block";

    if (data.success && data.results) {
      window.latestAnalysis = data; // store result globally for download
      resultSection.style.display = "block";
      resultContent.innerText = data.results;
      downloadBtn.style.display = "inline-block";
    } else {
      resultSection.style.display = "block";
      resultContent.innerText = "No analysis found.";
    }
  } catch (err) {
    loadingText.style.display = "none";
    analyzeBtn.style.display = "inline-block";
    alert("Error analyzing the image. Please try again.");
  }
});

// --- Download PDF Button ---
downloadBtn.addEventListener("click", async () => {
  if (!window.latestAnalysis || !window.latestAnalysis.results) {
    return alert("No analysis available to download.");
  }

  const payload = {
    results: window.latestAnalysis.results,
    image: window.latestAnalysis.image || null,
  };

  try {
    const res = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Failed to generate PDF");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Plant_Analysis.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Download error:", err);
    alert("Failed to download PDF. Check console for details.");
  }
});
