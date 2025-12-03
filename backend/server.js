// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateCreatives } = require('./services/creativeService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Generate creatives endpoint
app.post('/api/generate-creatives', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'product', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.logo || !req.files.product) {
      return res.status(400).json({ error: 'Both logo and product images are required' });
    }

    const logoPath = req.files.logo[0].path;
    const productPath = req.files.product[0].path;
    
    // Optional: brand and product names from request body (fallback if vision analysis fails)
    const brandName = req.body.brandName || null;
    const productName = req.body.productName || null;

    console.log('Generating creatives for:', { logoPath, productPath, brandName, productName });

    // Generate creatives (images + captions)
    const zipBuffer = await generateCreatives(logoPath, productPath, brandName, productName);

    // Clean up uploaded files
    fs.unlinkSync(logoPath);
    fs.unlinkSync(productPath);

    // Send zip file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ad-creatives.zip"');
    res.send(zipBuffer);

  } catch (error) {
    console.error('Error generating creatives:', error);
    
    // Clean up files on error
    if (req.files) {
      try {
        if (req.files.logo && req.files.logo[0]) {
          fs.unlinkSync(req.files.logo[0].path);
        }
      } catch (err) {}
      try {
        if (req.files.product && req.files.product[0]) {
          fs.unlinkSync(req.files.product[0].path);
        }
      } catch (err) {}
    }

    res.status(500).json({ 
      error: error.message || 'Failed to generate creatives' 
    });
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

