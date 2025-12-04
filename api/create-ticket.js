/**
 * /api/create-ticket.js
 * Unified Gorgias Ticket Creator for Vercel
 * Supports multiple forms (distinguished by "formType"), CORS, file uploads, robust errors.
 * 
 * Environment Variables Required:
 * - GORGIAS_SUBDOMAIN
 * - GORGIAS_USERNAME
 * - GORGIAS_API_KEY
 * - GORGIAS_API_URL
 * - GORGIAS_SUPPORT_EMAIL
 * - ALLOWED_ORIGIN (comma-separated, no spaces)
 */

import formidable from 'formidable';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

// Disable default Next.js body parsing
export const config = {
  api: { 
    bodyParser: false,
    responseLimit: '50mb'
  },
};

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',')
  : [];

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
      maxFiles: 5, 
      maxFileSize: 5 * 1024 * 1024 // 5MB per file
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

// Utility to format ticket body (can be extended per formType)
function formatTicketBodyForFormType(formType, fields) {
  if (formType === 'b2b-form') {
    // Format for B2B form
    let html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
        <h2 style="color: #21808D;">B2B Lead Form Submission</h2>
        
        <h3 style="color: #134252; margin-top: 20px;">Contact Information</h3>
        <p><strong>Full Name:</strong> ${fields.fullName || ''}</p>
        <p><strong>Email:</strong> ${fields.email || ''}</p>
        <p><strong>Phone:</strong> ${(fields.countryCode || '') + ' ' + (fields.phone || '')}</p>
        
        <h3 style="color: #134252; margin-top: 20px;">Business Information</h3>
        <p><strong>Company:</strong> ${fields.companyName || ''}</p>
        <p><strong>Tax ID:</strong> ${fields.taxId || ''}</p>
        <p><strong>Organization Type:</strong> ${fields.organizationType || ''}</p>
        <p><strong>Website:</strong> ${fields.website || ''}</p>
        <p><strong>Inquiry Type:</strong> ${fields.inquiryType || ''}</p>
        
        <h3 style="color: #134252; margin-top: 20px;">Address</h3>
        <p><strong>Street:</strong> ${fields.streetAddress || ''}</p>
        <p><strong>City:</strong> ${fields.city || ''}</p>
        <p><strong>State:</strong> ${fields.state || ''}</p>
        <p><strong>Postal Code:</strong> ${fields.postalCode || ''}</p>
    `;
    
    // Add conditional fields based on organization type
    if (fields.organizationType === 'education') {
      html += `
        <h3 style="color: #134252; margin-top: 20px;">Education Details</h3>
        <p><strong>Grade Levels:</strong> ${fields.gradeLevels || ''}</p>
        <p><strong>Number of Students:</strong> ${fields.numStudents || ''}</p>
      `;
    }
    
    if (fields.organizationType === 'interior-design') {
      html += `
        <h3 style="color: #134252; margin-top: 20px;">Interior Design Details</h3>
        <p><strong>Project Type:</strong> ${fields.projectType || ''}</p>
        <p><strong>Budget Range:</strong> ${fields.budgetRange || ''}</p>
        <p><strong>Playspace Design Service:</strong> ${fields.playspaceDesignId === 'yes' ? 'Yes' : 'No'}</p>
      `;
    }
    
    if (fields.organizationType === 'corporation') {
      html += `
        <h3 style="color: #134252; margin-top: 20px;">Corporation Details</h3>
        <p><strong>Company Size:</strong> ${fields.companySize || ''}</p>
        <p><strong>Industry:</strong> ${fields.industry || ''}</p>
      `;
    }
    
    if (fields.organizationType === 'hotel') {
      html += `
        <h3 style="color: #134252; margin-top: 20px;">Hotel Details</h3>
        <p><strong>Hotel Type:</strong> ${fields.hotelType || ''}</p>
        <p><strong>Number of Rooms:</strong> ${fields.numRooms || ''}</p>
        <p><strong>Playspace Design Service:</strong> ${fields.playspaceDesignHotel === 'yes' ? 'Yes' : 'No'}</p>
      `;
    }
    
    // Add message
    if (fields.message) {
      html += `
        <h3 style="color: #134252; margin-top: 20px;">Message</h3>
        <div style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px;">${fields.message}</div>
      `;
    }
    
    html += '</div>';
    return html;
  }
  
  // Playspace Design Service Form
  if (formType === 'playspace-design') {
  // Helper function ONLY for role field
  const formatRoleOther = (value) => {
    if (!value) return '';
    // If value starts with "Other –", prepend "role-other"
    if (value.startsWith('Other –')) {
      return value.replace('Other –', 'role-other –');
    }
    return value;
  };

  let html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      <h3 style="color: #134252; margin-top: 20px;">Contact Information</h3>
      <p><strong>Name:</strong> ${fields.name || fields.fullName || ''}</p>
      <p><strong>Email:</strong> ${fields.email || ''}</p>
      
      <h3 style="color: #134252; margin-top: 20px;">Space Requirements</h3>
      <p><strong>Type of Space:</strong> ${fields.space_type || fields.spaceType || ''}</p>
      <p><strong>Budget Range:</strong> ${fields.budget || ''}</p>
      <p><strong>Designed For:</strong> ${formatRoleOther(fields.designed_for || fields.designedFor || '')}</p>
      <p><strong>Project Timeline:</strong> ${fields.timeline || ''}</p>
  `;
  
  // Add notes if provided
  if (fields.notes) {
    html += `
      <h3 style="color: #134252; margin-top: 20px;">Additional Notes</h3>
      <div style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px;">${fields.notes}</div>
    `;
  }
  
  html += '</div>';
  return html;
}

  // Contact Form
if (formType === 'contact-form') {
  let html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      <h3 style="color: #134252; margin-top: 20px;">Contact Information</h3>
      <p><strong>Name:</strong> ${fields.name || fields.fullName || ''}</p>
      <p><strong>Email:</strong> ${fields.email || ''}</p>
      <p><strong>Phone:</strong> ${fields.phone || ''}</p>
      <p><strong>Fax:</strong> ${fields.fax || ''}</p>
      <p><strong>State:</strong> ${fields.state || ''}</p>
      <p><strong>Country:</strong> ${fields.country || ''}</p>
      
      <h3 style="color: #134252; margin-top: 20px;">Message</h3>
      <div style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px;">
        ${fields.notes || ''}
      </div>
    </div>
  `;
  return html;
}

  
  // Default fallback for unknown form types
  return `
    <div style="font-family: Arial, sans-serif;">
      <h2>Form Submission - ${formType}</h2>
      <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${JSON.stringify(fields, null, 2)}</pre>
    </div>
  `;
}

async function uploadAttachmentToGorgias(subdomain, apiUser, apiKey, file) {
  // CRITICAL FIX: Use /upload?type=attachment endpoint (not /attachments)
  // This matches the working submit-multi.js implementation
  
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
  
  // The /upload endpoint returns an array with one item
  const fileData = Array.isArray(data) ? data[0] : data;
  
  return {
    url: fileData.url,
    name: fileData.name || file.originalFilename,
    size: fileData.size,
    content_type: fileData.content_type
  };
}

export default async function handler(req, res) {
  // Always send CORS headers
  sendCORS(res, req);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('=== Unified Gorgias API Request Started ===');
    console.log('Origin:', req.headers.origin);
    console.log('Content-Type:', req.headers['content-type']);

    // Parse form fields and files
    const { fields, files } = await parseMultipart(req);
    console.log('✓ Parsed fields:', Object.keys(fields));
    console.log('✓ Parsed files:', Object.keys(files));

    // Get environment variables
    const subdomain = process.env.GORGIAS_SUBDOMAIN;
    const username = process.env.GORGIAS_USERNAME;
    const apiKey = process.env.GORGIAS_API_KEY;
    const apiUrl = process.env.GORGIAS_API_URL || `https://${subdomain}.gorgias.com/api`;
    const supportEmail = process.env.GORGIAS_SUPPORT_EMAIL || 'support@example.com';

    // Validate environment variables
    if (!subdomain || !username || !apiKey) {
      console.error('❌ Missing Gorgias credentials in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: 'Missing Gorgias API credentials'
      });
    }

    // Validate required fields
    if (!fields.formType) {
      console.error('❌ Missing formType');
      return res.status(400).json({ error: 'Missing formType field' });
    }
    
    if (!fields.email) {
      console.error('❌ Missing email');
      return res.status(400).json({ error: 'Missing email field' });
    }

    console.log('✓ FormType:', fields.formType);
    console.log('✓ Email:', fields.email);

    // Compose ticket body
    const ticketBodyHtml = formatTicketBodyForFormType(fields.formType, fields);
    
    // Prepare files for upload
    let uploadedFiles = [];
    let filesArr = [];
    
    if (files.companyDocuments) {
      filesArr = Array.isArray(files.companyDocuments) 
        ? files.companyDocuments 
        : [files.companyDocuments];
    }

    console.log(`Found ${filesArr.length} file(s) to upload`);

    // Upload all files to Gorgias using CORRECT endpoint
    for (let file of filesArr) {
      try {
        console.log(`Uploading: ${file.originalFilename || file.newFilename}`);
        const uploaded = await uploadAttachmentToGorgias(subdomain, username, apiKey, file);
        uploadedFiles.push(uploaded);
        console.log(`✓ Uploaded: ${uploaded.name}`);
      } catch (err) {
        console.error(`❌ Failed to upload ${file.originalFilename}:`, err.message);
        // Continue with other files instead of failing completely
      }
    }

    // Extract name fields (handle both forms)
    const name = fields.name || fields.fullName || '';
    const firstName = fields.firstName || name.split(' ')[0] || '';
    const lastName = fields.lastName || name.split(' ').slice(1).join(' ') || '';
    const fullName = name || `${firstName} ${lastName}`.trim() || fields.email;

    // Dynamic subject based on form type
    let subject = 'Form Inquiry';
    if (fields.formType === 'b2b-form') {
      subject = `B2B Inquiry - ${fields.companyName || fullName}`;
      if (fields.formType === 'contact-form') {
      subject = `Customer Inquiry - ${fullName}`;
    } else if (fields.formType === 'playspace-design') {
      subject = `Playspace Design Service Request - ${fullName}`;
    }

    let tags = [{ name: fields.formType }]; // Default tag
if (fields.tags) {
  try {
    const parsedTags = JSON.parse(fields.tags);
    tags = parsedTags.map(tag => ({ name: tag }));
  } catch (e) {
    console.warn('Failed to parse tags:', e.message);
  }
}

    // Create Gorgias ticket
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

    // Add attachments if any were uploaded
    if (uploadedFiles.length > 0) {
      ticketPayload.messages[0].attachments = uploadedFiles.map(file => ({
        url: file.url,
        name: file.name,
        size: file.size,
        content_type: file.content_type
      }));
      console.log(`✓ Added ${uploadedFiles.length} attachment(s) to ticket`);
    }

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
    console.log(`✅ Ticket created: #${ticketData.id}`);
    console.log('=== Request completed successfully ===\n');

    res.status(200).json({ 
      success: true, 
      ticketId: ticketData.id, 
      ticketUrl: ticketData.uri || `https://${subdomain}.gorgias.com/app/ticket/${ticketData.id}`,
      filesUploaded: uploadedFiles.length
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
