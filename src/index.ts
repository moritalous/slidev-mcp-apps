import { StreamableHTTPTransport } from '@hono/mcp';
import { serve } from '@hono/node-server';
import {
    registerAppResource,
    registerAppTool,
    RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { Hono } from 'hono';
import fs from "node:fs/promises";
import path from "node:path";
import { join, relative } from "path";
import { z } from "zod";


const resourceUri = "ui://get-time/mcp-app.html";

const syntaxGuide = `
# Syntax Guide

Slidev's slides are written as Markdown files, which are called **Slidev Markdown**s.

In a Slidev Markdown, not only [the basic Markdown features](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) can be used as usual, Slidev also provides additional features to enhance your slides. This section covers the syntax introduced by Slidev. Please make sure you know the basic Markdown syntax before reading this guide.

## Slide Separators {#slide-separators}

Use \`---\` padded with a new line to separate your slides.

\`\`\`\`md {5,15}
# Title

Hello, **Slidev**!

---

# Slide 2

Use code blocks for highlighting:

\`\`\`ts
console.log('Hello, World!')
\`\`\`

---

# Slide 3

Use UnoCSS classes and Vue components to style and enrich your slides:

<div class="p-3">
  <Tweet id="..." />
</div>
\`\`\`\`

## Frontmatter & Headmatter {#frontmatter}

At the beginning of each slide, you can add an optional [frontmatter](https://jekyllrb.com/docs/front-matter/) to configure the slide. The first frontmatter block is called **headmatter** and can configure the whole slide deck. The rest are **frontmatters** for individual slides. Texts in the headmatter or the frontmatter should be an object in [YAML](https://www.cloudbees.com/blog/yaml-tutorial-everything-you-need-get-started/) format. For example:

<!-- eslint-skip -->

\`\`\`md {1-4,10-14,26-28}
---
theme: seriph
title: Welcome to Slidev
---

# Slide 1

The frontmatter of this slide is also the headmatter

---
layout: center
background: /background-1.png
class: text-white
---

# Slide 2

A page with the layout \`center\` and a background image

---

# Slide 3

A page without frontmatter

---
src: ./pages/4.md  # This slide only contains a frontmatter
---

---

# Slide 5
\`\`\`

Configurations you can set are described in the [Slides deck configurations](/custom/#headmatter) and [Per slide configurations](/custom/#frontmatter) sections.

## Notes {#notes}

You can also create presenter notes for each slide. They will show up in <LinkInline link="guide/ui#presenter-mode" /> for you to reference during presentations.

The comment blocks at the end of each slide are treated as the note of the slide:

\`\`\`md {9,19-21}
---
layout: cover
---

# Slide 1

This is the cover page.

<!-- This is a **note** -->

---

# Slide 2

<!-- This is NOT a note because it is not at the end of the slide -->

The second page

<!--
This is _another_ note
-->
\`\`\`

Basic Markdown and HTML are also supported in notes and will be rendered.


## Code Blocks {#code-block}

One big reason that led to the creation of Slidev was the need to perfectly display code in slides. Consequently, you can use Markdown-flavored code blocks to highlight your code.

\`\`\`\`md
\`\`\`ts
console.log('Hello, World!')
\`\`\`
\`\`\`\`

Slidev has [Shiki](https://github.com/shikijs/shiki) built in as the syntax highlighter. Refer to [Configure Shiki](/custom/config-highlighter) for more details.


## Diagrams {#diagrams}

Slidev supports [Mermaid](https://mermaid.js.org/) and [PlantUML](https://plantuml.com/) for creating diagrams from text
`


// Create server instance
const server = new McpServer({
    name: "slidev",
    version: "1.0.0",
});

// Register generateSlide tool
registerAppTool(
    server,
    "generateSlide",
    {
        description: "Generate slides from Slidev markdown and export to PNG images",
        inputSchema: {
            markdown: z
                .string()
                .describe("Slidev format markdown content for the slides"),
            theme: z
                .enum(["default", "bricks", "apple-basic", "seriph", "shibainu"])
                .optional()
                .default("default")
                .describe("Slidev theme to use (defaults to default). Options: default, bricks, apple-basic, seriph, shibainu"),
        },
        _meta: { ui: { resourceUri } }
    },
    async ({ markdown, theme = "default" }) => {
        const projectDir = process.cwd();
        const workDir = join(projectDir, ".slidev-work");
        const executionId = randomUUID();
        const executionDir = join(workDir, executionId);

        try {
            // Ensure work directory exists
            if (!existsSync(workDir)) {
                mkdirSync(workDir, { recursive: true });
            }

            // Create execution-specific directory
            mkdirSync(executionDir, { recursive: true });

            // Write markdown to file in execution directory
            const markdownPath = join(executionDir, "slides.md");
            writeFileSync(markdownPath, markdown);

            // Export slides to PNG from execution directory
            // Use node_modules/.bin/slidev directly to ensure correct working directory
            const slidevPath = join(projectDir, "node_modules", ".bin", "slidev");
            execSync(`"${slidevPath}" export --format png --theme ${theme} "slides.md"`, {
                cwd: executionDir,
                stdio: "pipe",
            });

            // Read all PNG files (Slidev exports as 1.png, 2.png, etc.)
            const slidesExportDir = join(executionDir, "slides-export");
            const files = readdirSync(slidesExportDir)
                .filter(file => file.endsWith(".png"))
                .sort((a, b) => {
                    const numA = parseInt(a.split(".")[0]);
                    const numB = parseInt(b.split(".")[0]);
                    return numA - numB;
                });

            const contentArray = files.map(file => {
                const pngPath = join(slidesExportDir, file);
                const pngBuffer = readFileSync(pngPath);
                const base64Image = pngBuffer.toString("base64");
                return {
                    type: "image" as const,
                    data: base64Image,
                    mimeType: "image/png",
                };
            });

            return {
                content: [
                    {
                        type: "text" as const,
                        text: executionId,
                    },
                    {
                        type: "text" as const,
                        text: JSON.stringify({ markdown, theme }),
                    },
                    ...contentArray,
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to generate slides: ${errorMessage}`,
                    },
                ],
            };
        } finally {
            // Note: Execution directory is kept in .slidev-work for debugging purposes
            // Files can be manually cleaned up when needed
        }
    },
);

registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
        const html = await fs.readFile(
            path.join(import.meta.dirname, "mcp-app", "mcp-app.html"),
            "utf-8",
        );
        return {
            contents: [
                { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
            ],
        };
    }
)

// Register generateSlidePDF tool
server.registerTool(
    "generateSlidePDF",
    {
        description: "Generate slides from Slidev markdown and export to PDF",
        inputSchema: {
            markdown: z
                .string()
                .describe("Slidev format markdown content for the slides"),
            theme: z
                .enum(["default", "bricks", "apple-basic", "seriph", "shibainu"])
                .optional()
                .default("default")
                .describe("Slidev theme to use (defaults to default). Options: default, bricks, apple-basic, seriph, shibainu"),
        },
        _meta: { ui: { visibility: ["app"] } }
    },
    async ({ markdown, theme = "default" }) => {
        const projectDir = process.cwd();
        const workDir = join(projectDir, ".slidev-work");
        const executionId = randomUUID();
        const executionDir = join(workDir, executionId);

        try {
            // Ensure work directory exists
            if (!existsSync(workDir)) {
                mkdirSync(workDir, { recursive: true });
            }

            // Create execution-specific directory
            mkdirSync(executionDir, { recursive: true });

            // Write markdown to file in execution directory
            const markdownPath = join(executionDir, "slides.md");
            writeFileSync(markdownPath, markdown);

            // Export slides to PDF from execution directory
            const slidevPath = join(projectDir, "node_modules", ".bin", "slidev");
            execSync(`"${slidevPath}" export --format pdf --theme ${theme} "slides.md"`, {
                cwd: executionDir,
                stdio: "pipe",
            });

            // Return resource link to PDF file
            const pdfPath = join(executionDir, "slides-export.pdf");
            // Use absolute path for file:// URL
            const fileUrl = `file://${pdfPath}`;
            const pdfBuffer = readFileSync(pdfPath);
            const base64Pdf = pdfBuffer.toString("base64");

            return {
                content: [
                    {
                        type: "resource",
                        resource: {
                            uri: fileUrl,
                            blob: base64Pdf,
                            mimeType: "application/pdf",
                        },
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to generate PDF: ${errorMessage}`,
                    },
                ],
            };
        } finally {
            // Note: Execution directory is kept in .slidev-work for debugging purposes
            // Files can be manually cleaned up when needed
        }
    },
);

// Register generateSlidePPTX tool
server.registerTool(
    "generateSlidePPTX",
    {
        description: "Generate slides from Slidev markdown and export to PPTX (PowerPoint)",
        inputSchema: {
            markdown: z
                .string()
                .describe("Slidev format markdown content for the slides"),
            theme: z
                .enum(["default", "bricks", "apple-basic", "seriph", "shibainu"])
                .optional()
                .default("default")
                .describe("Slidev theme to use (defaults to default). Options: default, bricks, apple-basic, seriph, shibainu"),
        },
        _meta: { ui: { visibility: ["app"] } }
    },
    async ({ markdown, theme = "default" }) => {
        const projectDir = process.cwd();
        const workDir = join(projectDir, ".slidev-work");
        const executionId = randomUUID();
        const executionDir = join(workDir, executionId);

        try {
            // Ensure work directory exists
            if (!existsSync(workDir)) {
                mkdirSync(workDir, { recursive: true });
            }

            // Create execution-specific directory
            mkdirSync(executionDir, { recursive: true });

            // Write markdown to file in execution directory
            const markdownPath = join(executionDir, "slides.md");
            writeFileSync(markdownPath, markdown);

            // Export slides to PPTX from execution directory
            const slidevPath = join(projectDir, "node_modules", ".bin", "slidev");
            execSync(`"${slidevPath}" export --format pptx --theme ${theme} "slides.md"`, {
                cwd: executionDir,
                stdio: "pipe",
            });

            // Return resource link to PPTX file
            const pptxPath = join(executionDir, "slides-export.pptx");
            const relativePptxPath = relative(workDir, pptxPath);
            const fileUrl = `file://${relativePptxPath}`;
            const pptxBuffer = readFileSync(pptxPath);
            const base64Pptx = pptxBuffer.toString("base64");

            return {
                content: [
                    {
                        type: "resource",
                        resource: {
                            uri: fileUrl,
                            blob: base64Pptx,
                            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        },
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to generate PPTX: ${errorMessage}`,
                    },
                ],
            };
        } finally {
            // Note: Execution directory is kept in .slidev-work for debugging purposes
            // Files can be manually cleaned up when needed
        }
    },
);

server.registerResource(
    'Slidev Syntax Guide',
    'file://slidev-syntax-guide/',
    {
        title: 'Slidev Syntax Guide',
        description: 'Slidev Syntax Guide',
        mimeType: 'text/plain'
    },
    async uri => ({
        contents: [{ uri: uri.href, text: syntaxGuide }]
    })
)

async function main() {
    if (process.argv.includes("--stdio")) {
        // stdio
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Slidev MCP Server running on stdio");
    } else {
        // Streamable HTTP
        const app = new Hono();

        app.all("/mcp", async (c) => {
            const transport = new StreamableHTTPTransport();
            await server.connect(transport);
            return transport.handleRequest(c);
        });

        const port = parseInt(process.env.PORT || "8000", 10);
        serve({ fetch: app.fetch, port }, (info) => {
            console.error(`Slidev MCP Server running on http://localhost:${info.port}/mcp`);
        });
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});