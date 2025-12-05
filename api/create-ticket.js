/**
 * /api/create-ticket.js
 * 100% FORM-AGNOSTIC Gorgias Ticket Creator
 * Works with ANY form without modifications
 * 
 * Environment Variables Required:
 * - GORGIAS_SUBDOMAIN
 * - GORGIAS_USERNAME
 * - GORGIAS_API_KEY
 * - GORGIAS_SUPPORT_EMAIL
 * - ALLOWED_ORIGIN (comma-separated)
 * - ALLOWED_FILE_TYPES (optional, comma-separated MIME types, e.g., "image/jpeg,image/png,application/pdf")
 * - MAX_FILE_SIZE (optional, in bytes, default: 5MB)
 */

import formidable from 'formidable';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

export const config = {
  api: { 
    bodyParser: false,
    responseLimit: '50mb'
  },
};

// Configuration
const allowedOrigins = process.env.ALLOWED_ORIGIN?.split(',') || [];
const allowedFileTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
];
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB default

// Reserved fields that shouldn't appear in the ticket body
const RESERVED_FIELDS = ['formType', 'tags', 'customSubject', 'Subject', 'fileFieldName'];

function sendCORS(res, req) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ 
      multiples: true, 
      maxFiles: 20,
      maxFileSize: maxFileSize,
      // File type filter
      filter: function({ name, originalFilename, mimetype }) {
        console.log(`📎 File validation: ${originalFilename} (${mimetype})`);
        
        // Allow if no mimetype restriction is set
        if (allowedFileTypes.length === 0) return true;
        
        // Check if mimetype is in allowed list
        const isAllowed = mimetype && allowedFileTypes.includes(mimetype);
        
        if (!isAllowed) {
          console.warn(`❌ File type rejected: ${mimetype} for ${originalFilename}`);
        }
        
        return isAllowed;
      }
    });
    
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Flatten fields (formidable v3 returns arrays)
      const flatFields = {};
      for (let key in fields) {
        flatFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      }
      
      resolve({ fields: flatFields, files });
    });
  });
}

/**
 * Generic field formatter - converts field names to human-readable labels
 * Examples: 
 *   "firstName" → "First Name"
 *   "company_name" → "Company Name"
 *   "taxID" → "Tax ID"
 */
function formatFieldName(fieldName) {
  return fieldName
    // Insert space before capital letters: firstName → first Name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Capitalize first letter of each word
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

/**
 * Generate generic HTML body from ANY form fields
 */
function generateGenericTicketBody(formType, fields) {
  let html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 800px;">
  `;
  
  // Filter out reserved fields and empty values
  const dataFields = Object.entries(fields).filter(([key, value]) => {
    return !RESERVED_FIELDS.includes(key) && value && value.toString().trim() !== '';
  });
  
  if (dataFields.length === 0) {
    html += '<p style="color: #999; font-style: italic;">No additional data submitted</p>';
  } else {
    // Use clean definition list layout instead of table
    for (const [key, value] of dataFields) {
      const label = formatFieldName(key);
      const displayValue = value.toString().trim();
      
      // Check if it's a long text field (like message/notes)
      const isLongText = displayValue.length > 100 || displayValue.includes('\n');
      
      if (isLongText) {
        // Full-width formatting for long text
        html += `
          <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #21808D; border-radius: 4px;">
            <strong style="display: block; color: #134252; margin-bottom: 8px; font-size: 15px;">${label}</strong>
            <div style="color: #333; white-space: pre-wrap; line-height: 1.5;">${displayValue}</div>
          </div>
        `;
      } else {
        // Compact formatting for short fields
        html += `
          <div style="margin: 12px 0; padding: 10px 0; border-bottom: 1px solid #e9ecef;">
            <strong style="color: #134252; display: inline-block; min-width: 140px;">${label}:</strong>
            <span style="color: #333;">${displayValue}</span>
          </div>
        `;
      }
    }
  }
  
  html += '</div>';
  return html;
}

async function uploadAttachmentToGorgias(subdomain, apiUser, apiKey, file) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(file.filepath), {
    filename: file.originalFilename || file.newFilename,
    contentType: file.mimetype || 'application/octet-stream',
  });
  
  const uploadUrl = `https://${subdomain}.gorgias.com/api/upload?type=attachment`;
  
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(apiUser + ':' + apiKey).toString('base64'),
      ...formData.getHeaders()
    },
    body: formData
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to upload attachment: ${res.status} ${errorText}`);
  }
  
  const data = await res.json();
  const fileData = Array.isArray(data) ? data[0] : data;
  
  return {
    url: fileData.url,
    name: fileData.name || file.originalFilename,
    size: fileData.size,
    content_type: fileData.content_type
  };
}

export default async function handler(req, res) {
  sendCORS(res, req);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('=== Generic Form-to-Gorgias Handler ===');
    console.log('Allowed file types:', allowedFileTypes.join(', '));
    
    // Parse incoming data
    const { fields, files } = await parseMultipart(req);
    console.log('✓ Parsed fields:', Object.keys(fields).join(', '));
    console.log('✓ Parsed files:', Object.keys(files).join(', '));

    // Validate credentials
    const subdomain = process.env.GORGIAS_SUBDOMAIN;
    const username = process.env.GORGIAS_USERNAME;
    const apiKey = process.env.GORGIAS_API_KEY;
    const apiUrl = `https://${subdomain}.gorgias.com/api`;
    const supportEmail = process.env.GORGIAS_SUPPORT_EMAIL || 'support@example.com';

    if (!subdomain || !username || !apiKey) {
      throw new Error('Missing Gorgias API credentials');
    }

    // Validate required fields
    if (!fields.formType || !fields.email) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['formType', 'email']
      });
    }

    console.log('✓ Form Type:', fields.formType);
    console.log('✓ Customer Email:', fields.email);

    // Generate generic ticket body
    const ticketBodyHtml = generateGenericTicketBody(fields.formType, fields);
    
    // Upload ALL files from ANY field
    let uploadedFiles = [];
    const rejectedFiles = [];
    
    for (const [fieldName, fileOrFiles] of Object.entries(files)) {
      const filesArray = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
      
      for (const file of filesArray) {
        try {
          console.log(`📤 Uploading: ${file.originalFilename} from field "${fieldName}"`);
          const uploaded = await uploadAttachmentToGorgias(subdomain, username, apiKey, file);
          uploadedFiles.push(uploaded);
          console.log(`✅ Uploaded: ${uploaded.name}`);
        } catch (err) {
          console.error(`❌ Upload failed for ${file.originalFilename}:`, err.message);
          rejectedFiles.push({
            filename: file.originalFilename,
            reason: err.message
          });
        }
      }
    }

    // Extract customer name (flexible)
    const name = fields.name || fields.fullName || fields.firstName || '';
    const firstName = fields.firstName || name.split(' ')[0] || '';
    const lastName = fields.lastName || name.split(' ').slice(1).join(' ') || '';
    const fullName = name || `${firstName} ${lastName}`.trim() || fields.email.split('@')[0];

    
    // Generate subject - use custom subject if provided, otherwise auto-generate
    const subject = fields.subject || fields.customSubject || `${formatFieldName(fields.formType)} - ${fullName}`;


    // Parse tags (support JSON array or comma-separated)
    let tags = [{ name: fields.formType }];
    if (fields.tags) {
      try {
        const parsedTags = JSON.parse(fields.tags);
        tags = Array.isArray(parsedTags) 
          ? parsedTags.map(tag => ({ name: tag }))
          : [{ name: fields.formType }];
      } catch (e) {
        // Try comma-separated
        const tagList = fields.tags.split(',').map(t => t.trim()).filter(t => t);
        if (tagList.length > 0) {
          tags = tagList.map(tag => ({ name: tag }));
        }
      }
    }

    // Build ticket payload
    const ticketPayload = {
      channel: 'email',
      via: 'api',
      customer: {
        email: fields.email,
        name: fullName,
        firstname: firstName,
        lastname: lastName
      },
      subject: subject,
      messages: [
        {
          source: {
            type: 'email',
            to: [{ address: supportEmail }],
            from: { address: fields.email, name: fullName }
          },
          body_html: ticketBodyHtml,
          channel: 'email',
          from_agent: false,
          via: 'api',
          public: true
        }
      ],
      tags: tags,
      status: 'open'
    };

    // Add attachments if any
    if (uploadedFiles.length > 0) {
      ticketPayload.messages[0].attachments = uploadedFiles;
      console.log(`✓ Attached ${uploadedFiles.length} file(s)`);
    }

    // Create ticket
    console.log('Creating Gorgias ticket...');
    const resp = await fetch(`${apiUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(username + ':' + apiKey).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ticketPayload)
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('❌ Gorgias API error:', resp.status, errorText);
      return res.status(502).json({ 
        error: 'Failed to create ticket', 
        status: resp.status,
        details: errorText 
      });
    }

    const ticketData = await resp.json();
    console.log(`✅ Ticket #${ticketData.id} created successfully`);
    console.log('=== Request completed ===\n');

    res.status(200).json({ 
      success: true, 
      ticketId: ticketData.id, 
      ticketUrl: ticketData.uri || `https://${subdomain}.gorgias.com/app/ticket/${ticketData.id}`,
      filesUploaded: uploadedFiles.length,
      filesRejected: rejectedFiles.length,
      rejectedFiles: rejectedFiles
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}
