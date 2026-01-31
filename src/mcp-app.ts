import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";

const slidesContainer = document.getElementById("slides-container")!;
const markdownInput = document.getElementById("markdown-input") as HTMLTextAreaElement;
const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
const regenerateBtn = document.getElementById("generate-slides-btn") as HTMLButtonElement;
const generatePdfBtn = document.getElementById("generate-pdf-btn") as HTMLButtonElement;
const generatePptxBtn = document.getElementById("generate-pptx-btn") as HTMLButtonElement;
const pdfStatusDiv = document.getElementById("pdf-status")!;

let currentExecutionId: string | null = null;

const app = new App({ name: "Slide Generator", version: "1.0.0" });

// Handle host context changes (theme, fonts, etc.)
app.onhostcontextchanged = (params) => {
  if (params.theme) {
    applyDocumentTheme(params.theme);
  }
  if (params.styles?.variables) {
    applyHostStyleVariables(params.styles.variables);
  }
  if (params.styles?.css?.fonts) {
    applyHostFonts(params.styles.css.fonts);
  }
};

// Establish communication with the host
app.connect().then(() => {
  // Apply initial theme and styles after connection
  const ctx = app.getHostContext();
  if (ctx?.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx?.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx?.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
});

// Handle tool result pushed by the host
app.ontoolresult = (result) => {
  slidesContainer.innerHTML = "";

  // Extract executionId and params from text contents
  const textContents = (result.content as Array<Record<string, unknown>>)?.filter(
    (c) => c.type === "text"
  ) ?? [];

  if (textContents.length >= 2) {
    currentExecutionId = textContents[0].text as string;
    const paramsText = textContents[1].text;
    console.log("Execution ID:", currentExecutionId);
    console.log("Params:", paramsText);

    try {
      const params = JSON.parse(paramsText as string);
      markdownInput.value = params.markdown;
      themeSelect.value = params.theme;
    } catch (e) {
      console.error("Failed to parse params:", e);
    }
  }

  displaySlides(result);
};

const displaySlides = (result: Record<string, unknown>) => {
  const images = (result.content as Array<Record<string, unknown>>)?.filter(
    (c) => c.type === "image"
  ) ?? [];

  if (images.length === 0) {
    slidesContainer.textContent = "[ERROR] No images found";
    return;
  }

  images.forEach((image) => {
    const img = document.createElement("img");
    img.src = `data:image/png;base64,${image.data as string}`;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.marginBottom = "20px";
    img.style.display = "block";
    img.style.border = "1px solid var(--color-border-primary, #e0e0e0)";
    img.style.borderRadius = "8px";
    img.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
    slidesContainer.appendChild(img);
  });
};

// Handle Regenerate button click
const handleRegenerate = async (): Promise<void> => {
  const markdown = markdownInput.value.trim();
  const theme = themeSelect.value;

  if (!markdown) {
    alert("Please populate markdown first");
    return;
  }

  regenerateBtn.disabled = true;
  regenerateBtn.textContent = "Regenerating...";
  slidesContainer.innerHTML = "Regenerating slides...";

  try {
    console.log("Regenerating with theme:", theme);

    // Generate slides with new theme
    const slideResult = await app.callServerTool({
      name: "generateSlide",
      arguments: { markdown, theme },
    });

    console.log("Result from generateSlide:", slideResult);

    if (slideResult.isError) {
      const errorText =
        slideResult.content?.[0]?.type === "text"
          ? (slideResult.content[0] as Record<string, unknown>).text
          : "Unknown error";
      throw new Error(errorText as string);
    }

    displaySlides(slideResult as Record<string, unknown>);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Regenerate error:", errorMsg, error);
    slidesContainer.textContent = `Error: ${errorMsg}`;
  } finally {
    regenerateBtn.disabled = false;
    regenerateBtn.textContent = "Regenerate with Theme";
  }
};

// Handle Generate PDF button click
const handleGeneratePdf = async (): Promise<void> => {
  if (!currentExecutionId) {
    alert("Please generate slides first");
    return;
  }

  generatePdfBtn.disabled = true;
  generatePdfBtn.textContent = "Generating PDF...";
  pdfStatusDiv.textContent = "Generating PDF...";

  try {
    const markdown = markdownInput.value.trim();
    const theme = themeSelect.value;

    if (!markdown) {
      pdfStatusDiv.textContent = "Please populate markdown first";
      return;
    }

    pdfStatusDiv.innerHTML = `<strong>Generating PDF with theme: ${theme}</strong>`;

    // Call generateSlidePDF with markdown and theme
    const pdfResult = await app.callServerTool({
      name: "generateSlidePDF",
      arguments: { markdown, theme },
    });

    if (pdfResult.isError) {
      const errorText =
        pdfResult.content?.[0]?.type === "text"
          ? (pdfResult.content[0] as Record<string, unknown>).text
          : "Unknown error";
      pdfStatusDiv.innerHTML += `<br><strong>Error:</strong> ${errorText}`;
      throw new Error(errorText as string);
    }

    const resourceContent = pdfResult.content?.find(
      (c) => c.type === "resource"
    );

    if (!resourceContent) {
      throw new Error("No PDF resource found in response");
    }

    const resource = resourceContent.resource as Record<string, unknown>;
    const pdfData = resource.blob as string;

    if (!pdfData) {
      throw new Error("Invalid PDF data");
    }

    // Create data URL from Base64
    const dataUrl = `data:application/pdf;base64,${pdfData}`;

    // Display data URL for manual copy-paste
    const urlContainer = document.createElement("div");
    urlContainer.style.marginTop = "15px";
    urlContainer.style.padding = "10px";
    urlContainer.style.backgroundColor = "#f8f9fa";
    urlContainer.style.borderRadius = "4px";
    urlContainer.style.border = "1px solid #dee2e6";

    const urlLabel = document.createElement("div");
    urlLabel.textContent = "PDF Data URL (copy and paste into browser address bar):";
    urlLabel.style.marginBottom = "8px";
    urlLabel.style.fontSize = "12px";
    urlLabel.style.color = "#666";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = dataUrl;
    urlInput.readOnly = true;
    urlInput.style.width = "100%";
    urlInput.style.padding = "8px";
    urlInput.style.marginBottom = "8px";
    urlInput.style.borderRadius = "4px";
    urlInput.style.border = "1px solid #ccc";
    urlInput.style.fontSize = "11px";
    urlInput.style.fontFamily = "monospace";
    urlInput.style.boxSizing = "border-box";

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select All";
    selectBtn.style.padding = "8px 12px";
    selectBtn.style.backgroundColor = "#17a2b8";
    selectBtn.style.color = "white";
    selectBtn.style.border = "none";
    selectBtn.style.borderRadius = "4px";
    selectBtn.style.cursor = "pointer";

    selectBtn.addEventListener("click", () => {
      urlInput.select();
    });

    urlContainer.appendChild(urlLabel);
    urlContainer.appendChild(urlInput);
    urlContainer.appendChild(selectBtn);
    pdfStatusDiv.appendChild(urlContainer);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    pdfStatusDiv.innerHTML += `<br><strong>Exception:</strong> ${errorMsg}`;
  } finally {
    generatePdfBtn.disabled = false;
    generatePdfBtn.textContent = "Generate PDF";
  }
};

// Handle Generate PPTX button click
const handleGeneratePptx = async (): Promise<void> => {
  generatePptxBtn.disabled = true;
  generatePptxBtn.textContent = "Generating PPTX...";
  pdfStatusDiv.innerHTML = "<br><strong>Generating PPTX with theme: " + themeSelect.value + "</strong>";

  try {
    const markdown = markdownInput.value.trim();
    const theme = themeSelect.value;

    if (!markdown) {
      pdfStatusDiv.innerHTML += "<br>Please populate markdown first";
      return;
    }

    // Call generateSlidePPTX with markdown and theme
    const pptxResult = await app.callServerTool({
      name: "generateSlidePPTX",
      arguments: { markdown, theme },
    });

    if (pptxResult.isError) {
      const errorText =
        pptxResult.content?.[0]?.type === "text"
          ? (pptxResult.content[0] as Record<string, unknown>).text
          : "Unknown error";
      pdfStatusDiv.innerHTML += `<br><strong>Error:</strong> ${errorText}`;
      throw new Error(errorText as string);
    }

    const resourceContent = pptxResult.content?.find(
      (c) => c.type === "resource"
    );

    if (!resourceContent) {
      throw new Error("No PPTX resource found in response");
    }

    const resource = resourceContent.resource as Record<string, unknown>;
    const pptxData = resource.blob as string;

    if (!pptxData) {
      throw new Error("Invalid PPTX data");
    }

    // Create data URL from Base64
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${pptxData}`;

    // Display data URL for manual copy-paste
    const urlContainer = document.createElement("div");
    urlContainer.style.marginTop = "15px";
    urlContainer.style.padding = "10px";
    urlContainer.style.backgroundColor = "#f8f9fa";
    urlContainer.style.borderRadius = "4px";
    urlContainer.style.border = "1px solid #dee2e6";

    const urlLabel = document.createElement("div");
    urlLabel.textContent = "PPTX Data URL (copy and paste into browser address bar):";
    urlLabel.style.marginBottom = "8px";
    urlLabel.style.fontSize = "12px";
    urlLabel.style.color = "#666";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = dataUrl;
    urlInput.readOnly = true;
    urlInput.style.width = "100%";
    urlInput.style.padding = "8px";
    urlInput.style.marginBottom = "8px";
    urlInput.style.borderRadius = "4px";
    urlInput.style.border = "1px solid #ccc";
    urlInput.style.fontSize = "11px";
    urlInput.style.fontFamily = "monospace";
    urlInput.style.boxSizing = "border-box";

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select All";
    selectBtn.style.padding = "8px 12px";
    selectBtn.style.backgroundColor = "#17a2b8";
    selectBtn.style.color = "white";
    selectBtn.style.border = "none";
    selectBtn.style.borderRadius = "4px";
    selectBtn.style.cursor = "pointer";

    selectBtn.addEventListener("click", () => {
      urlInput.select();
    });

    urlContainer.appendChild(urlLabel);
    urlContainer.appendChild(urlInput);
    urlContainer.appendChild(selectBtn);
    pdfStatusDiv.appendChild(urlContainer);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    pdfStatusDiv.innerHTML += `<br><strong>Exception:</strong> ${errorMsg}`;
  } finally {
    generatePptxBtn.disabled = false;
    generatePptxBtn.textContent = "Generate PPTX";
  }
};

regenerateBtn.addEventListener("click", handleRegenerate);
generatePdfBtn.addEventListener("click", handleGeneratePdf);
generatePptxBtn.addEventListener("click", handleGeneratePptx);

// Listen for markdown input changes
markdownInput.addEventListener("input", () => {
  console.log("Markdown updated");
});
