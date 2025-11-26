# Gorgias Unified API (Simple Single-File)

> **Production-ready, single-file Vercel serverless function for creating Gorgias tickets from multiple form types.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SyadavGC/gorgias-unified-api-simple)

---

## 🎯 Features

- ✅ **Single-file architecture** - No complex imports, no module resolution issues
- ✅ **Multiple form support** - B2B forms, Playspace Design forms, easily extensible
- ✅ **Multiple file uploads** - Up to 5 files, 5MB each
- ✅ **CORS-compliant** - Whitelisted origins only
- ✅ **Production-ready** - Error handling, logging, validation
- ✅ **Zero configuration** - Just add environment variables and deploy

---

## 🚀 Quick Start

### 1. Deploy to Vercel

Click the button above or:

```bash
git clone https://github.com/SyadavGC/gorgias-unified-api-simple.git
cd gorgias-unified-api-simple
npm install
vercel
```

### 2. Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables, add:

| Variable | Example Value | Required |
|----------|---------------|----------|
| `GORGIAS_SUBDOMAIN` | `guidecraft` | ✅ |
| `GORGIAS_USERNAME` | `api-user@guidecraft.com` | ✅ |
| `GORGIAS_API_KEY` | Your Gorgias API key | ✅ |
| `GORGIAS_API_URL` | `https://guidecraft.gorgias.com/api` | ✅ |
| `GORGIAS_SUPPORT_EMAIL` | `support@guidecraft.com` | ✅ |
| `ALLOWED_ORIGIN` | `https://guidecraft.com,https://www.guidecraft.com` | ✅ |

**Important:**
- ❌ NO quotes around values
- ❌ NO spaces after commas in `ALLOWED_ORIGIN`
- ✅ Set for "All Environments"
- ✅ Redeploy after adding/changing variables

### 3. Test the API

Open your browser console on `https://guidecraft.com` and run:

```javascript
fetch('https://your-project.vercel.app/api/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        formType: 'b2b-form',
        email: 'test@test.com' 
    })
}).then(r => r.json()).then(console.log);
```

You should see:
```json
{"error":"Missing required fields", ...}
```

This means CORS is working! ✅

---

## 📝 Frontend Integration

### B2B Form Example

```javascript
const API_URL = 'https://your-project.vercel.app/api/create-ticket';

form.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData();
  
  // REQUIRED: Add formType
  formData.append('formType', 'b2b-form');
  
  // Add form fields
  formData.append('email', document.getElementById('email').value);
  formData.append('fullName', document.getElementById('fullName').value);
  formData.append('companyName', document.getElementById('companyName').value);
  formData.append('phone', document.getElementById('phone').value);
  formData.append('countryCode', document.getElementById('countryCode').value);
  formData.append('streetAddress', document.getElementById('streetAddress').value);
  formData.append('city', document.getElementById('city').value);
  formData.append('state', document.getElementById('state').value);
  formData.append('postalCode', document.getElementById('postalCode').value);
  formData.append('organizationType', document.getElementById('organizationType').value);
  formData.append('message', document.getElementById('message').value);
  // ... add all other fields
  
  // Add files (supports multiple)
  const fileInput = document.getElementById('companyDocuments');
  for (let file of fileInput.files) {
    formData.append('companyDocuments', file);
  }
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      alert(`Success! Ticket #${result.ticketId}`);
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});
```

---

## 🔧 Supported Form Types

### Currently Implemented

1. **`b2b-form`** - B2B Lead Form
   - Required: `email`, `fullName`
   - Optional: All business fields, conditional organization type fields
   - Files: Multiple files via `companyDocuments`

### Adding New Form Types

Edit `api/create-ticket.js` and add a new case in `formatTicketBodyForFormType`:

```javascript
function formatTicketBodyForFormType(formType, fields) {
  if (formType === 'b2b-form') {
    // ... existing B2B formatting
  }
  
  // ADD YOUR NEW FORM TYPE HERE
  if (formType === 'contact-form') {
    return `
      <h3>Contact Form Submission</h3>
      <strong>Name:</strong> ${fields.name || ''}<br>
      <strong>Email:</strong> ${fields.email || ''}<br>
      <strong>Message:</strong> ${fields.message || ''}<br>
    `;
  }
  
  // Default fallback
  return `<pre>${JSON.stringify(fields, null, 2)}</pre>`;
}
```

---

## 🐛 Troubleshooting

### CORS Error

**Symptom:** `No 'Access-Control-Allow-Origin' header is present`

**Solution:**
1. Check `ALLOWED_ORIGIN` environment variable in Vercel
2. Ensure NO spaces after commas: `https://guidecraft.com,https://www.guidecraft.com`
3. Ensure both HTTP and HTTPS variants are included if needed
4. **MUST redeploy** after changing environment variables

### 404 Not Found

**Symptom:** API endpoint returns 404

**Solution:**
1. Verify file exists at `api/create-ticket.js`
2. Check Vercel build logs for errors
3. Ensure `package.json` has correct dependencies
4. Redeploy from Vercel dashboard

### Missing Required Fields

**Symptom:** `{"error":"Missing email field"}`

**Solution:**
1. Verify `formType` is being sent in FormData
2. Check `email` field is included in FormData
3. Open browser Network tab and inspect request payload

### File Upload Fails

**Symptom:** Files not attached to ticket

**Solution:**
1. Check file size (max 5MB per file)
2. Check file count (max 5 files)
3. Verify field name is `companyDocuments`
4. Check Vercel function logs for upload errors
5. Verify Gorgias API credentials are correct

---

## 📊 API Response Format

### Success Response (200)

```json
{
  "success": true,
  "ticketId": 12345,
  "ticketUrl": "https://guidecraft.gorgias.com/app/ticket/12345",
  "filesUploaded": 2
}
```

### Error Response (4xx/5xx)

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

---

## 🏗️ Architecture

```
gorgias-unified-api-simple/
├── api/
│   └── create-ticket.js    # Single-file handler (all logic)
├── package.json            # Dependencies
├── vercel.json             # Vercel configuration
├── .env.example            # Environment variable template
└── README.md               # Documentation
```

**Why Single-File?**
- ✅ No import/module resolution issues
- ✅ CORS always applied correctly
- ✅ Easier debugging and maintenance
- ✅ Faster cold starts
- ✅ Zero build configuration needed

---

## 🔐 Security

- ✅ CORS whitelisting (only allowed origins)
- ✅ File size limits (5MB per file)
- ✅ File count limits (max 5 files)
- ✅ Environment variable protection (credentials never exposed)
- ✅ Input validation (required fields checked)
- ✅ Error messages don't expose sensitive data

---

## 🛠️ Development

### Local Testing

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your actual credentials

# Run locally
vercel dev
```

The API will be available at `http://localhost:3000/api/create-ticket`

### Testing CORS

For local testing, temporarily set:
```
ALLOWED_ORIGIN=http://localhost:3000,http://localhost:8000
```

---

## 📚 Related Documentation

- [Gorgias API Documentation](https://developers.gorgias.com/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)
- [Formidable File Upload](https://github.com/node-formidable/formidable)

---

## 📄 License

MIT

---

## 🙋 Support

If you encounter issues:

1. Check [Troubleshooting](#-troubleshooting) section
2. Verify environment variables are set correctly
3. Check Vercel deployment logs
4. Test with the browser console example above
5. Ensure you've redeployed after changing environment variables

---

## ✨ Why This Solution?

Your previous implementation (`b2b-form`) worked perfectly because it was a single file. When we tried to split the code into multiple modules (`unified-gorgias-api`), Vercel had issues with module imports, causing CORS headers to never be sent.

This solution combines the best of both worlds:
- ✅ Single-file reliability (like your old working code)
- ✅ Multi-form support (unified approach)
- ✅ Extensible and maintainable
- ✅ Production-ready with proper error handling

---

**Made with ❤️ for Guidecraft**