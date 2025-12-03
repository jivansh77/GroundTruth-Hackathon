// Load environment variables
require('dotenv').config();

const { HfInference } = require('@huggingface/inference');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');

// Initialize HuggingFace Inference Client
// Note: The package exports HfInference (not InferenceClient in CommonJS)
const HF_API_KEY = process.env.HF_API_KEY || '';
if (!HF_API_KEY) {
  console.warn('Warning: HF_API_KEY not found in environment variables');
} else {
  console.log('✓ HF_API_KEY loaded');
}

// Initialize client with router endpoint to avoid deprecated endpoint
// The client should automatically use router when provider is specified
const client = new HfInference(HF_API_KEY, {
  baseUrl: 'https://router.huggingface.co'
});

// ============================================================================
// GEMINI CODE (COMMENTED OUT - REQUIRES PAID PLAN)
// ============================================================================
// The Google Gemini 2.5 Flash Image model requires a paid plan for image generation.
// The free tier has 0 quota for image generation, so we're using HuggingFace FLUX instead.
//
// If you have a paid Gemini plan, you can uncomment this code:
//
// const { GoogleGenAI } = require('@google/genai');
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// const ai = new GoogleGenAI(GEMINI_API_KEY);
//
// Then in generateImage(), use:
// const response = await ai.models.generateContent({
//   model: "gemini-2.5-flash-image",
//   contents: [
//     { text: prompt },
//     { inlineData: { mimeType: "image/jpeg", data: productBase64 } },
//     { inlineData: { mimeType: "image/jpeg", data: logoBase64 } }
//   ]
// });
// ============================================================================

// Number of variations to generate
const NUM_VARIATIONS = 1; // Testing with 1, change back to 12 for production

/**
 * Generate ad creative variations from logo and product images
 */
async function generateCreatives(logoPath, productPath) {
  const tempDir = path.join(__dirname, '..', 'temp_generations');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Read images
    const logoBuffer = fs.readFileSync(logoPath);
    const productBuffer = fs.readFileSync(productPath);

    // Generate variations
    const creatives = [];
    
    for (let i = 0; i < NUM_VARIATIONS; i++) {
      console.log(`Generating creative ${i + 1}/${NUM_VARIATIONS}...`);
      
      try {
        // Generate image variation using FLUX with product image as base
        const imagePrompt = generateImagePrompt(i);
        const imageBuffer = await generateImage(imagePrompt, productBuffer);
        
        // Generate caption
        const caption = await generateCaption(imagePrompt, i);
        
        // Save image
        const imageFilename = `creative-${i + 1}.jpg`;
        const imagePath = path.join(tempDir, imageFilename);
        await sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .jpeg({ quality: 90 })
          .toFile(imagePath);
        
        // Save caption
        const captionFilename = `creative-${i + 1}.txt`;
        const captionPath = path.join(tempDir, captionFilename);
        fs.writeFileSync(captionPath, caption);
        
        creatives.push({
          imagePath,
          captionPath,
          imageFilename,
          captionFilename
        });
        
        console.log(`✓ Creative ${i + 1} generated`);
      } catch (error) {
        console.error(`Error generating creative ${i + 1}:`, error.message);
        // Continue with next variation
      }
    }

    if (creatives.length === 0) {
      throw new Error('Failed to generate any creatives');
    }

    // Create zip file
    const zipBuffer = await createZipFile(creatives, tempDir);
    
    // Clean up temp files
    creatives.forEach(creative => {
      try {
        fs.unlinkSync(creative.imagePath);
        fs.unlinkSync(creative.captionPath);
      } catch (err) {
        console.error('Error cleaning up file:', err);
      }
    });

    return zipBuffer;
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.readdirSync(tempDir).forEach(file => {
        try {
          fs.unlinkSync(path.join(tempDir, file));
        } catch (err) {}
      });
    }
    throw error;
  }
}

/**
 * Generate image prompt for variation
 */
function generateImagePrompt(variationIndex) {
  const styles = [
    'modern minimalist design with clean lines and white space',
    'vibrant and colorful with bold typography and dynamic layouts',
    'elegant and sophisticated with premium feel and luxury aesthetics',
    'playful and energetic with dynamic composition and bright colors',
    'professional corporate style with subtle branding and clean design',
    'artistic and creative with unique visual elements and creative typography',
    'luxury aesthetic with gold accents and premium materials',
    'tech-forward design with futuristic elements and modern graphics',
    'natural and organic with earthy tones and authentic photography',
    'bold and striking with high contrast and dramatic lighting',
    'soft and feminine with pastel colors and gentle gradients',
    'urban and edgy with street style and contemporary design'
  ];

  const compositions = [
    'product centered with logo in top corner',
    'product on left, logo on right with text overlay',
    'product as hero image with logo integrated seamlessly',
    'split screen design with product and logo balanced',
    'product in foreground with logo in background',
    'logo prominent at top, product featured below',
    'product surrounded by logo elements',
    'minimalist layout with product and logo side by side',
    'product with logo watermark overlay',
    'dynamic diagonal composition with product and logo',
    'product showcase with logo in footer',
    'creative collage style with product and logo integrated'
  ];

  const style = styles[variationIndex % styles.length];
  const composition = compositions[variationIndex % compositions.length];
  
  return `Create an engaging ad creative featuring a brand logo and product image. Style: ${style}. Composition: ${composition}. The design should be professional, eye-catching, and suitable for social media advertising. Include the product prominently while maintaining brand identity. High quality, commercial photography style, well-lit, professional composition, no text overlays, clean design.`;
}

/**
 * Generate image using HuggingFace InferenceClient
 * Uses textToImage for generation, or imageToImage if product image is provided
 */
async function generateImage(prompt, productBuffer = null) {
  try {
    console.log('Generating image with HuggingFace InferenceClient...');
    
    let imageBlob;
    
    if (productBuffer) {
      // Use imageToImage to edit the product image with the prompt
      // HfInference accepts Buffer directly, but let's try both formats
      try {
        // Use imageToImage with Qwen model via fal-ai provider
        // The client should handle the Buffer/Blob conversion
        // If it needs a Blob, we'll create one
        let imageInput = productBuffer;
        
        // Check if we need to convert to Blob (Node.js 18+ has Blob)
        if (typeof Blob !== 'undefined') {
          try {
            imageBlob = await client.imageToImage({
              provider: "fal-ai",
              model: "Qwen/Qwen-Image-Edit",
              inputs: productBuffer, // Try Buffer first
              parameters: { 
                prompt: prompt,
                negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy"
              }
            });
            console.log('✓ Image generated using imageToImage with Qwen model');
          } catch (blobError) {
            // If Buffer fails, try with Blob
            const productBlob = new Blob([productBuffer], { type: 'image/jpeg' });
            imageBlob = await client.imageToImage({
              provider: "fal-ai",
              model: "Qwen/Qwen-Image-Edit",
              inputs: productBlob,
              parameters: { 
                prompt: prompt,
                negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy"
              }
            });
            console.log('✓ Image generated using imageToImage with Qwen model (Blob format)');
          }
        } else {
          // Fallback if Blob is not available
          throw new Error('Blob not available in this Node.js version');
        }
      } catch (imageEditError) {
        console.log('imageToImage failed, falling back to textToImage:', imageEditError.message);
        // Fallback to text-to-image if image editing fails
        imageBlob = await generateImageViaRouter(prompt);
      }
    } else {
      // Use router endpoint directly since HfInference uses deprecated endpoint
      imageBlob = await generateImageViaRouter(prompt);
    }

    // Convert blob to buffer
    // Handle both Blob objects and Buffer objects
    if (Buffer.isBuffer(imageBlob)) {
      return imageBlob;
    } else if (imageBlob && typeof imageBlob.arrayBuffer === 'function') {
      const arrayBuffer = await imageBlob.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      throw new Error('Unexpected image format returned');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Check for API errors
    if (error.response?.status === 429 || (error.message && error.message.includes('quota'))) {
      throw new Error('HuggingFace API quota exceeded. Please check your API key limits.');
    }
    
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

/**
 * Generate image using fal-ai provider via router
 * According to fal-ai docs: https://huggingface.co/docs/inference-providers/en/providers/fal-ai
 * FLUX.1-dev requires GPU, so use fal-ai provider
 * The client should use router endpoint when baseUrl is set
 */
async function generateImageViaRouter(prompt) {
  try {
    console.log('Using fal-ai provider for textToImage (FLUX requires GPU)...');
    
    // Use HfInference client with fal-ai provider for FLUX
    // fal-ai provider supports GPU models like FLUX
    // The client should use router endpoint when configured
    const imageBlob = await client.textToImage({
      provider: "fal-ai",
      model: "black-forest-labs/FLUX.1-dev",
      inputs: prompt,
      parameters: {
        negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy",
        guidance_scale: 7.5,
        num_inference_steps: 30
      }
    });
    
    return imageBlob;
  } catch (error) {
    console.error('Error in generateImageViaRouter:', error.message);
    
    // If the client still uses deprecated endpoint, try direct router call
    if (error.message && error.message.includes('no longer supported')) {
      console.log('Client using deprecated endpoint, trying direct router call with fal-ai provider...');
      return await generateImageViaDirectRouter(prompt);
    }
    
    // If fal-ai provider fails, the model might not be available
    if (error.message && error.message.includes('not available')) {
      throw new Error('FLUX.1-dev model not available. Please check your API key has access to fal-ai provider or use Inference Endpoints.');
    }
    
    throw error;
  }
}

/**
 * Generate image using router endpoint directly with fal-ai provider
 * Fallback when HfInference client uses deprecated endpoint
 */
async function generateImageViaDirectRouter(prompt) {
  try {
    // Use router endpoint with provider in request body
    // According to fal-ai docs, provider should be specified in the request
    const response = await axios.post(
      `https://router.huggingface.co/models/black-forest-labs/FLUX.1-dev`,
      {
        inputs: prompt,
        parameters: {
          negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy",
          guidance_scale: 7.5,
          num_inference_steps: 30
        },
        provider: "fal-ai"  // Specify provider in request body
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Provider': 'fal-ai'  // Also try as header
        },
        responseType: 'arraybuffer'
      }
    );
    
    // Return as Blob-like object
    return {
      arrayBuffer: async () => response.data
    };
  } catch (error) {
    console.error('Error in generateImageViaDirectRouter:', error.response?.status, error.response?.data?.toString() || error.message);
    
    // Try alternative format with provider in URL query param
    try {
      console.log('Trying alternative router format with provider in URL...');
      const response2 = await axios.post(
        `https://router.huggingface.co/models/black-forest-labs/FLUX.1-dev?provider=fal-ai`,
        {
          inputs: prompt,
          parameters: {
            negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy",
            guidance_scale: 7.5,
            num_inference_steps: 30
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      
      return {
        arrayBuffer: async () => response2.data
      };
    } catch (error2) {
      throw new Error(`Router endpoint failed: ${error2.response?.status} - ${error2.response?.data?.toString() || error2.message}`);
    }
  }
}

/**
 * Generate caption using HuggingFace LLM
 */
async function generateCaption(imagePrompt, variationIndex) {
  try {
    const systemPrompt = "You are a professional copywriter specializing in social media advertising. Create engaging, compelling ad captions that drive action.";
    
    const userPrompt = `Based on this ad creative description: "${imagePrompt}"

Create a compelling social media ad caption (2-3 sentences) that:
- Is engaging and attention-grabbing
- Includes a clear call-to-action
- Is suitable for platforms like Instagram, Facebook, and Twitter
- Is professional but conversational
- Encourages clicks and engagement

Variation style: ${variationIndex % 3 === 0 ? 'Direct and action-oriented' : variationIndex % 3 === 1 ? 'Emotional and storytelling' : 'Benefit-focused and value-driven'}`;

    const response = await axios.post(
      'https://router.huggingface.co/v1/chat/completions',
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct:sambanova',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let caption = response.data.choices[0].message.content.trim();
    
    // Clean up the caption
    caption = caption
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    return caption || 'Discover our amazing product today!';
  } catch (error) {
    console.error('Error generating caption:', error);
    // Fallback caption
    return `Experience the difference with our premium product. Shop now and transform your lifestyle today!`;
  }
}

/**
 * Create zip file from creatives
 */
async function createZipFile(creatives, tempDir) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    const chunks = [];
    
    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });

    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Add files to zip
    creatives.forEach(creative => {
      archive.file(creative.imagePath, { name: creative.imageFilename });
      archive.file(creative.captionPath, { name: creative.captionFilename });
    });

    archive.finalize();
  });
}

module.exports = {
  generateCreatives
};
