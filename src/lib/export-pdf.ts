/**
 * PDF export functionality using html2canvas + jsPDF
 */

import type { Conversation, ExportOptions, ChatMessage } from './types'

// Dynamic imports for jspdf and html2canvas
let jsPDFModule: any = null
let html2canvasModule: any = null

async function loadJsPDF() {
  if (!jsPDFModule) {
    jsPDFModule = await import('jspdf')
  }
  return jsPDFModule.jsPDF || jsPDFModule.default.jsPDF
}

async function loadHtml2Canvas() {
  if (!html2canvasModule) {
    html2canvasModule = await import('html2canvas')
  }
  return html2canvasModule.default || html2canvasModule
}

/**
 * Generate HTML content from a conversation
 * @param conversation - The conversation to convert
 * @param options - Export options
 * @returns HTML string
 */
export function conversationToHtml(
  conversation: Conversation,
  options: ExportOptions
): string {
  const title = escapeHtml(conversation.title || 'Untitled Conversation')
  const platform = conversation.platform === 'chatgpt' ? 'ChatGPT' : 'Google Gemini'
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${getPrintStyles()}
  </style>
</head>
<body>
  <div class="conversation">
    ${options.includeMetadata ? generateMetadataSection(conversation, platform) : ''}
    
    <div class="messages">
      ${conversation.messages.map(msg => generateMessageHtml(msg, options)).join('\n')}
    </div>
    
    <footer>
      <hr>
      <p>Exported from ${platform} on ${new Date().toLocaleDateString()}</p>
    </footer>
  </div>
</body>
</html>`
}

/**
 * Generate metadata HTML section
 * @param conversation - The conversation
 * @param platform - Platform name
 * @returns HTML string
 */
function generateMetadataSection(conversation: Conversation, platform: string): string {
  const createdInfo = conversation.createdAt
    ? `<p><strong>Created:</strong> ${new Date(conversation.createdAt).toLocaleString()}</p>`
    : ''
  
  return `
    <header>
      <h1>${escapeHtml(conversation.title || 'Untitled Conversation')}</h1>
      <div class="metadata">
        <p><strong>Platform:</strong> ${platform}</p>
        <p><strong>URL:</strong> <a href="${escapeHtml(conversation.url)}">${escapeHtml(conversation.url)}</a></p>
        <p><strong>Messages:</strong> ${conversation.messages.length}</p>
        ${createdInfo}
      </div>
    </header>
    <hr>`
}

/**
 * Generate HTML for a single message
 * @param message - The message
 * @param options - Export options
 * @returns HTML string
 */
function generateMessageHtml(message: ChatMessage, options: ExportOptions): string {
  const roleClass = message.role === 'user' ? 'user' : 'assistant'
  const roleLabel = message.role === 'user' ? '👤 User' : '🤖 Assistant'
  const authorInfo = message.authorName ? ` (${escapeHtml(message.authorName)})` : ''
  
  let content = ''
  
  // Add timestamp
  if (message.timestamp && options.includeMetadata) {
    const time = new Date(message.timestamp).toLocaleTimeString()
    content += `<span class="timestamp">${time}</span>\n`
  }
  
  // Add content
  if (message.content) {
    content += `<div class="content">${formatHtmlContent(message.content)}</div>\n`
  }
  
  // Add code blocks
  if (options.includeCodeBlocks && message.codeBlocks?.length) {
    message.codeBlocks.forEach(block => {
      const lang = block.language ? ` data-language="${escapeHtml(block.language)}"` : ''
      content += `<pre${lang}><code>${escapeHtml(block.code)}</code></pre>\n`
    })
  }
  
  // Add images
  if (options.includeImages && message.attachments?.length) {
    const images = message.attachments.filter(a => a.type === 'image')
    images.forEach(img => {
      content += `<div class="image"><img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.name || 'Image')}" /></div>\n`
    })
  }
  
  return `
    <div class="message ${roleClass}">
      <div class="role">${roleLabel}${authorInfo}</div>
      ${content}
    </div>`
}

/**
 * Format content with HTML
 * @param content - Plain text content
 * @returns HTML formatted content
 */
function formatHtmlContent(content: string): string {
  // Escape HTML first
  let html = escapeHtml(content)
  
  // Convert double newlines to paragraphs
  html = html.split('\n\n').map(para => {
    // Convert single newlines to <br>
    return `<p>${para.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  
  return html
}

/**
 * Escape HTML special characters
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, char => map[char])
}

/**
 * Get print-specific CSS styles
 * @returns CSS string
 */
function getPrintStyles(): string {
  return `
    @page {
      margin: 1in;
      size: A4;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      margin-bottom: 30px;
    }
    
    h1 {
      color: #1a1a1a;
      margin-bottom: 10px;
    }
    
    .metadata {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      font-size: 0.9em;
    }
    
    .metadata p {
      margin: 5px 0;
    }
    
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }
    
    .message {
      margin-bottom: 25px;
      padding: 15px;
      border-radius: 8px;
    }
    
    .message.user {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
    }
    
    .message.assistant {
      background: #f5f5f5;
      border-left: 4px solid #4caf50;
    }
    
    .role {
      font-weight: 600;
      margin-bottom: 10px;
      color: #555;
    }
    
    .timestamp {
      font-size: 0.85em;
      color: #888;
      display: block;
      margin-bottom: 10px;
    }
    
    .content {
      white-space: pre-wrap;
    }
    
    .content p {
      margin: 10px 0;
    }
    
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 10px 0;
    }
    
    code {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9em;
    }
    
    .image {
      margin: 15px 0;
    }
    
    .image img {
      max-width: 100%;
      border-radius: 4px;
    }
    
    footer {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 0.9em;
    }
    
    a {
      color: #2196f3;
      text-decoration: none;
    }
    
    @media print {
      body {
        padding: 0;
      }
      
      .message {
        break-inside: avoid;
      }
    }
  `
}

/**
 * Get PDF page dimensions based on page size
 * @param pageSize - Page size (A4 or Letter)
 * @returns Page dimensions in mm
 */
function getPageSizeDimensions(pageSize: 'A4' | 'Letter' = 'A4'): { width: number; height: number } {
  if (pageSize === 'Letter') {
    return { width: 216, height: 279 } // Letter in mm
  }
  return { width: 210, height: 297 } // A4 in mm
}

/**
 * Export conversation to PDF blob
 * @param conversation - The conversation
 * @param options - Export options
 * @returns PDF as Blob
 */
export async function exportToPdfBlob(
  conversation: Conversation,
  options: ExportOptions
): Promise<Blob> {
  const html = conversationToHtml(conversation, options)
  
  // Create a hidden container for rendering
  const container = document.createElement('div')
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: 800px;
    background: white;
    padding: 40px;
  `
  container.innerHTML = html
  document.body.appendChild(container)
  
  try {
    // Wait for styles to apply
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Load html2canvas and render
    const html2canvas = await loadHtml2Canvas()
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    })
    
    // Load jsPDF and create PDF
    const jsPDF = await loadJsPDF()
    const pageSize = options.format === 'pdf' ? 'A4' : 'Letter'
    const dimensions = getPageSizeDimensions(pageSize as 'A4' | 'Letter')
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: pageSize.toLowerCase() as any
    })
    
    // Calculate dimensions for the canvas image
    const imgWidth = dimensions.width - 20 // 10mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    
    // Handle multi-page
    let position = 10 // 10mm top margin
    const pageHeight = dimensions.height - 20 // 10mm top and bottom margins
    
    if (imgHeight <= pageHeight) {
      // Single page
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 10, position, imgWidth, imgHeight)
    } else {
      // Multi-page
      let remainingHeight = imgHeight
      let sourceY = 0
      
      while (remainingHeight > 0) {
        const sliceHeight = Math.min(remainingHeight, pageHeight)
        const sourceSliceHeight = (sliceHeight / imgHeight) * canvas.height
        
        // Create a slice of the canvas
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sourceSliceHeight
        const ctx = sliceCanvas.getContext('2d')
        
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceSliceHeight,
            0, 0, canvas.width, sourceSliceHeight
          )
          
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 10, position, imgWidth, sliceHeight)
        }
        
        remainingHeight -= sliceHeight
        sourceY += sourceSliceHeight
        
        if (remainingHeight > 0) {
          pdf.addPage()
          position = 10
        }
      }
    }
    
    // Return as Blob
    return pdf.output('blob')
  } finally {
    // Clean up temporary DOM elements
    document.body.removeChild(container)
  }
}

/**
 * Export conversation to PDF and auto-download
 * @param conversation - The conversation
 * @param options - Export options
 * @param filename - Filename for the downloaded file
 */
export async function exportToPdf(
  conversation: Conversation,
  options: ExportOptions,
  filename: string
): Promise<void> {
  // Ensure filename has .pdf extension
  if (!filename.endsWith('.pdf')) {
    filename += '.pdf'
  }
  
  // Generate PDF blob
  const blob = await exportToPdfBlob(conversation, options)
  
  // Create object URL
  const url = URL.createObjectURL(blob)
  
  try {
    // Auto-download using chrome.downloads API
    await chrome.downloads.download({
      url,
      filename,
      saveAs: false
    })
  } finally {
    // Clean up object URL
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Download conversation as HTML file
 * @param conversation - The conversation
 * @param options - Export options
 */
export async function downloadAsHtml(
  conversation: Conversation,
  options: ExportOptions
): Promise<void> {
  const html = conversationToHtml(conversation, options)
  const filename = generateHtmlFilename(conversation)
  
  // Create download
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  
  await chrome.downloads.download({
    url,
    filename,
    saveAs: false
  })
  
  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Generate filename for HTML export
 * @param conversation - The conversation
 * @returns Sanitized filename
 */
function generateHtmlFilename(conversation: Conversation): string {
  const title = conversation.title || 'conversation'
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100)
  
  return `${sanitized}.html`
}
