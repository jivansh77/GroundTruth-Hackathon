// Load environment variables
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');

// Initialize HuggingFace API Key
// Using direct router endpoint calls instead of InferenceClient to avoid deprecated endpoint issues
const HF_API_KEY = process.env.HF_API_KEY || '';
if (!HF_API_KEY) {
  console.warn('Warning: HF_API_KEY not found in environment variables');
} else {
  console.log('✓ HF_API_KEY loaded');
}

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
 * Generate image using HuggingFace Router API directly
 * Uses textToImage for generation, or imageToImage if product image is provided
 * Uses direct router endpoint to avoid deprecated API issues
 * 
 * Note: wavespeed provider may require payment/credits (402 error). 
 * If you get a 402 error, you may need to:
 * 1. Add credits to your HuggingFace account
 * 2. Use a different provider/model that's free
 * 3. Set up your own Inference Endpoint
 */
async function generateImage(prompt, productBuffer = null) {
  try {
    console.log('Generating image with HuggingFace Router API...');
    
    if (!productBuffer) {
      throw new Error('Product image is required for image generation');
    }
    
    // Use imageToImage to edit the product image with the prompt
    const imageBuffer = await generateImageViaRouterImageToImage(prompt, productBuffer);
    console.log('✓ Image generated using imageToImage with FLUX.2-dev');
    
    return imageBuffer;
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Check for API errors
    if (error.response?.status === 429 || (error.message && error.message.includes('quota'))) {
      throw new Error('HuggingFace API quota exceeded. Please check your API key limits.');
    }
    
    if (error.response?.status === 402 || (error.message && error.message.includes('402'))) {
      throw new Error('Payment required: The wavespeed provider requires credits. Please add credits to your HuggingFace account at https://huggingface.co/settings/billing, or use a free alternative model.');
    }
    
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

/**
 * Generate image using wavespeed provider via router endpoint for imageToImage
 * Uses direct router endpoint: https://router.huggingface.co/wavespeed/api/v3/wavespeed-ai/flux-2-dev/edit
 */
async function generateImageViaRouterImageToImage(prompt, imageBuffer) {
  try {
    console.log('Using wavespeed router endpoint for imageToImage (FLUX.2-dev)...');
    
    // Convert buffer to base64
    const imageBase64 = imageBuffer.toString('base64');
    // Determine image type from buffer (default to jpeg, but could be png/webp)
    const imageType = 'jpeg'; // You could detect this from the buffer if needed
    const imageDataUri = `data:image/${imageType};base64,${imageBase64}`;
    
    // Use wavespeed endpoint - API expects "images" field (array) instead of "inputs"
    // Based on error: "property 'images' is missing"
    const response = await axios.post(
      'https://router.huggingface.co/wavespeed/api/v3/wavespeed-ai/flux-2-dev/edit',
      {
        images: [imageDataUri], // API expects images as an array
        prompt: prompt,
        parameters: {
          negative_prompt: "blurry, distorted, low quality, duplicate, watermark, text overlay, ugly, bad anatomy"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Wavespeed API returns async job - need to poll for results
    const responseData = response.data;
    
    // Check if it's the async job format: { code: 200, message: "success", data: { status: "created", urls: { get: "..." } } }
    if (responseData && responseData.data && responseData.data.id) {
      const jobId = responseData.data.id;
      console.log(`Job created with ID: ${jobId}, polling for results...`);
      
      // Use router endpoint for polling (not the direct wavespeed API)
      const pollUrl = `https://router.huggingface.co/wavespeed/api/v3/predictions/${jobId}/result`;
      
      // Poll the result URL until job is complete
      const maxAttempts = 60; // 60 attempts
      const pollInterval = 2000; // 2 seconds between polls
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          // Poll using router endpoint with HuggingFace token
          const resultResponse = await axios.get(pollUrl, {
            headers: {
              'Authorization': `Bearer ${HF_API_KEY}`
            }
          });
          
          const resultData = resultResponse.data;
          // Response format: { code: 200, message: "success", data: { status: "...", outputs: [...] } }
          const status = resultData.data?.status || resultData.status;
          
          console.log(`Poll attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);
          
          if (status === 'completed' || status === 'succeeded') {
            // Job completed, extract image from outputs array
            const outputs = resultData.data?.outputs || resultData.outputs || [];
            
            if (outputs.length > 0) {
              // Get the first output image URL
              const imageUrl = outputs[0];
              
              if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                // Fetch image from URL (e.g., CloudFront URL)
                console.log(`Fetching generated image from: ${imageUrl}`);
                const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                return Buffer.from(imageResponse.data);
              } else if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
                // Base64 data URI
                const base64Data = imageUrl.split(',')[1];
                return Buffer.from(base64Data, 'base64');
              } else {
                throw new Error(`Unexpected image format in outputs: ${typeof imageUrl}`);
              }
            }
            
            throw new Error('Job completed but outputs array is empty');
          } else if (status === 'failed' || status === 'error') {
            const errorMsg = resultData.data?.error || resultData.error || 'Job failed';
            throw new Error(`Image generation job failed: ${errorMsg}`);
          }
          // If status is still 'created' or 'processing', continue polling
        } catch (pollError) {
          // Handle various error cases
          if (pollError.response) {
            const status = pollError.response.status;
            // 404 or 401 might mean job is still processing or not ready
            if (status === 404 || status === 401) {
              console.log(`Result not ready yet (${status}), continuing to poll...`);
              continue;
            }
            // Log other errors but continue polling (might be temporary)
            if (status >= 500) {
              console.log(`Server error (${status}), retrying...`);
              continue;
            }
          }
          // If it's not a retryable error, throw it
          throw pollError;
        }
      }
      
      throw new Error('Image generation timed out - job did not complete within expected time');
    }
    
    // If response is not async job format, try to extract image directly
    if (responseData && responseData.data && typeof responseData.data === 'object') {
      const data = responseData.data;
      
      // Check for outputs array
      if (data.outputs && Array.isArray(data.outputs) && data.outputs[0]) {
        const imageData = data.outputs[0];
        if (typeof imageData === 'string') {
          if (imageData.startsWith('data:')) {
            const base64Data = imageData.split(',')[1];
            return Buffer.from(base64Data, 'base64');
          } else if (imageData.startsWith('http')) {
            const imageResponse = await axios.get(imageData, { responseType: 'arraybuffer' });
            return Buffer.from(imageResponse.data);
          }
        }
      }
    }
    
    // Fallback: try to parse as direct image response
    if (Buffer.isBuffer(response.data)) {
      return response.data;
    }
    
    throw new Error(`Unexpected response format. Response structure: ${JSON.stringify(responseData, null, 2).substring(0, 500)}`);
  } catch (error) {
    // Log full error details for debugging
    if (error.response) {
      const errorData = typeof error.response.data === 'object' 
        ? error.response.data 
        : (error.response.data ? JSON.parse(error.response.data.toString()) : {});
      console.error('Full error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: errorData,
        headers: error.response.headers
      });
      
      // Extract meaningful error message
      const errorMsg = errorData.error || errorData.message || errorData.detail || error.message;
      throw new Error(`ImageToImage failed (${error.response.status}): ${errorMsg}`);
    }
    
    console.error('Error in generateImageViaRouterImageToImage:', error.message);
    throw error;
  }
}

/**
 * Generate image using wavespeed provider via router endpoint for textToImage
 * Uses direct router endpoint for FLUX.2-dev text-to-image
 */
async function generateImageViaRouterTextToImage(prompt) {
  try {
    console.log('Using wavespeed router endpoint for textToImage (FLUX.2-dev)...');
    
    // Use wavespeed endpoint for text-to-image
    // Note: "product not found" error suggests this endpoint might not support text-to-image
    // Try without /edit suffix, or use a different endpoint
    let response;
    try {
      // First try: standard endpoint without /edit
      response = await axios.post(
        'https://router.huggingface.co/wavespeed/api/v3/wavespeed-ai/flux-2-dev',
        {
          prompt: prompt,
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
          }
        }
      );
    } catch (firstError) {
      // If that fails, try with /generate or different path
      console.log('Standard textToImage endpoint failed, trying alternative...');
      throw new Error('Text-to-image may not be available for wavespeed flux-2-dev. Consider using imageToImage with a blank/white image instead.');
    }
    
    // Response might be JSON with image data or direct image bytes
    if (Buffer.isBuffer(response.data)) {
      return response.data;
    } else if (typeof response.data === 'string') {
      // If it's a base64 string
      if (response.data.startsWith('data:')) {
        const base64Data = response.data.split(',')[1];
        return Buffer.from(base64Data, 'base64');
      }
      return Buffer.from(response.data, 'base64');
    } else if (response.data && response.data.image) {
      // If response is JSON with image field (base64 or URL)
      const imageData = response.data.image;
      if (imageData.startsWith('data:')) {
        const base64Data = imageData.split(',')[1];
        return Buffer.from(base64Data, 'base64');
      } else if (imageData.startsWith('http')) {
        // If it's a URL, fetch it
        const imageResponse = await axios.get(imageData, { responseType: 'arraybuffer' });
        return Buffer.from(imageResponse.data);
      }
      return Buffer.from(imageData, 'base64');
    } else {
      // Try to parse as JSON and look for common image fields
      const jsonData = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
      if (jsonData.images && jsonData.images[0]) {
        const imageData = jsonData.images[0];
        if (imageData.startsWith('data:')) {
          const base64Data = imageData.split(',')[1];
          return Buffer.from(base64Data, 'base64');
        }
        return Buffer.from(imageData, 'base64');
      }
      throw new Error('Unexpected response format from textToImage endpoint');
    }
  } catch (error) {
    // Log full error details for debugging
    if (error.response) {
      const errorData = typeof error.response.data === 'object' 
        ? error.response.data 
        : (error.response.data ? JSON.parse(error.response.data.toString()) : {});
      console.error('Full error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: errorData,
        headers: error.response.headers
      });
      
      // Extract meaningful error message
      const errorMsg = errorData.error || errorData.message || errorData.detail || error.message;
      throw new Error(`TextToImage failed (${error.response.status}): ${errorMsg}`);
    }
    
    console.error('Error in generateImageViaRouterTextToImage:', error.message);
    throw error;
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
