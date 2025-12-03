// Load environment variables
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize HuggingFace API Keys (using multiple keys for rate limiting)
// Using direct router endpoint calls instead of InferenceClient to avoid deprecated endpoint issues
const HF_API_KEY1 = process.env.HF_API_KEY1 || '';
const HF_API_KEY2 = process.env.HF_API_KEY2 || '';
const HF_API_KEY3 = process.env.HF_API_KEY3 || '';

// Fallback to single key if multiple keys not provided
const HF_API_KEY = process.env.HF_API_KEY || HF_API_KEY1 || '';

if (!HF_API_KEY1 && !HF_API_KEY2 && !HF_API_KEY3 && !HF_API_KEY) {
  console.warn('Warning: No HF_API_KEY found in environment variables');
} else {
  if (HF_API_KEY1) console.log('✓ HF_API_KEY1 loaded');
  if (HF_API_KEY2) console.log('✓ HF_API_KEY2 loaded');
  if (HF_API_KEY3) console.log('✓ HF_API_KEY3 loaded');
  if (!HF_API_KEY1 && !HF_API_KEY2 && !HF_API_KEY3 && HF_API_KEY) {
    console.log('✓ HF_API_KEY loaded (single key mode)');
  }
}

/**
 * Get the appropriate API key based on variation index
 * Key 1: variations 0-3 (first 4)
 * Key 2: variations 4-6 (next 3)
 * Key 3: variations 7-9 (last 3)
 */
function getApiKeyForVariation(variationIndex) {
  if (variationIndex < 4) {
    return HF_API_KEY1 || HF_API_KEY;
  } else if (variationIndex < 7) {
    return HF_API_KEY2 || HF_API_KEY;
  } else {
    return HF_API_KEY3 || HF_API_KEY;
  }
}

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let geminiAI = null;
if (GEMINI_API_KEY) {
  geminiAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  console.log('✓ GEMINI_API_KEY loaded');
} else {
  console.warn('Warning: GEMINI_API_KEY not found in environment variables');
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
const NUM_VARIATIONS = 10; // Generate 10 variations per upload

/**
 * Generate ad creative variations from logo and product images
 * @param {string} logoPath - Path to logo image
 * @param {string} productPath - Path to product image
 * @param {string} [brandName] - Optional brand name (fallback if vision analysis fails)
 * @param {string} [productName] - Optional product name (fallback if vision analysis fails)
 */
async function generateCreatives(logoPath, productPath, brandName = null, productName = null) {
  const tempDir = path.join(__dirname, '..', 'temp_generations');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Read images
    const logoBuffer = fs.readFileSync(logoPath);
    const productBuffer = fs.readFileSync(productPath);

    // Analyze images with vision model to extract brand/product info
    let brandContext = await analyzeImagesWithVision(logoBuffer, productBuffer);
    
    // Use user-provided names if vision analysis didn't find clear results
    if ((!brandContext.brand || brandContext.brand === 'the brand') && brandName) {
      brandContext.brand = brandName;
    }
    if ((!brandContext.product || brandContext.product === 'the product') && productName) {
      brandContext.product = productName;
    }
    
    // Update description if we have better info
    if (brandContext.brand !== 'the brand' && brandContext.product !== 'the product') {
      brandContext.description = `${brandContext.brand} ${brandContext.product}`;
    }
    
    console.log(`Using brand context: ${brandContext.description}`);

    // Generate variations
    const creatives = [];
    
    for (let i = 0; i < NUM_VARIATIONS; i++) {
      console.log(`Generating creative ${i + 1}/${NUM_VARIATIONS}...`);
      
      try {
        // Get the appropriate API key for this variation
        const apiKey = getApiKeyForVariation(i);
        console.log(`Using API key ${i < 4 ? '1' : i < 7 ? '2' : '3'} for variation ${i + 1}`);
        
        // Generate creative, marketing-ready image prompt using Gemini
        const imagePrompt = await generateCreativeImagePromptWithGemini(i, brandContext, productBuffer);
        const imageBuffer = await generateImage(imagePrompt, productBuffer, apiKey);
        
        // Generate caption with brand context
        const caption = await generateCaption(imagePrompt, i, brandContext);
        
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
 * Analyze images using Gemini 2.0 Flash to extract brand and product information
 * Uses Google Gemini 2.0 Flash model to identify brand name, product type, and key details
 */
async function analyzeImagesWithVision(logoBuffer, productBuffer) {
  try {
    console.log('Analyzing images with Gemini 2.0 Flash to extract brand/product info...');
    
    if (!geminiAI) {
      console.warn('Gemini API not initialized, using fallback');
      return {
        brand: 'the brand',
        product: 'the product',
        description: 'a product'
      };
    }
    
    // Get the Gemini 2.0 Flash model
    const model = geminiAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // Convert buffers to base64
    const logoBase64 = logoBuffer.toString('base64');
    const productBase64 = productBuffer.toString('base64');
    
    // Analyze logo image
    const logoPrompt = "What brand or company name is shown in this logo? Extract the exact brand name. If you see text, provide it exactly as shown. Only return the brand name, nothing else.";
    
    const logoResult = await model.generateContent([
      {
        inlineData: {
          data: logoBase64,
          mimeType: 'image/jpeg'
        }
      },
      logoPrompt
    ]);
    
    const logoResponse = await logoResult.response;
    const logoText = logoResponse.text().trim();
    
    // Analyze product image
    const productPrompt = "What product is shown in this image? Describe the product type, brand name if visible, and key features. Be specific about the product name and type. Format: 'Brand Name - Product Type' or just 'Product Type' if no brand is visible.";
    
    const productResult = await model.generateContent([
      {
        inlineData: {
          data: productBase64,
          mimeType: 'image/jpeg'
        }
      },
      productPrompt
    ]);
    
    const productResponse = await productResult.response;
    const productText = productResponse.text().trim();
    
    // Extract brand name from logo analysis
    let brand = logoText;
    // Clean up brand name
    brand = brand.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    
    // Extract brand and product from product analysis
    let product = productText;
    
    // Try to extract brand from product description if not found in logo
    if (!brand || brand.length < 2 || brand.toLowerCase() === 'unknown' || brand.toLowerCase().includes('cannot')) {
      // Look for pattern like "Brand - Product" or "Brand Product"
      const brandProductMatch = productText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-–]\s*(.+)/);
      if (brandProductMatch) {
        brand = brandProductMatch[1].trim();
        product = brandProductMatch[2].trim();
      } else {
        // Try to find capitalized words at the start
        const brandMatch = productText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (brandMatch) {
          brand = brandMatch[1].trim();
          product = productText.replace(new RegExp(brand, 'gi'), '').trim();
        }
      }
    } else {
      // Remove brand from product description if found
      product = product.replace(new RegExp(brand, 'gi'), '').trim();
    }
    
    // Clean up extracted text
    brand = brand.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    product = product.replace(/^[^a-zA-Z0-9]*/, '').replace(/[^a-zA-Z0-9\s]*$/, '').trim();
    
    // If still no brand, use generic
    if (!brand || brand.length < 2 || brand.toLowerCase() === 'unknown') {
      brand = 'the brand';
    }
    
    // If no product, use generic
    if (!product || product.length < 2) {
      product = 'the product';
    }
    
    console.log(`✓ Vision analysis complete - Brand: "${brand}", Product: "${product}"`);
    
    return {
      brand: brand,
      product: product,
      description: `${brand} ${product}`.trim()
    };
  } catch (error) {
    console.error('Error in vision analysis:', error.message);
    return {
      brand: 'the brand',
      product: 'the product',
      description: 'a product'
    };
  }
}

/**
 * Generate creative, marketing-ready image prompt using Gemini based on product/brand analysis
 * Creates contextual, visually stunning prompts like "Pepsi bottle on a beach with waves"
 */
async function generateCreativeImagePromptWithGemini(variationIndex, brandContext, productBuffer) {
  try {
    if (!geminiAI || !brandContext) {
      // Fallback to basic prompt if Gemini not available
      return generateImagePrompt(variationIndex, brandContext);
    }
    
    console.log(`Generating creative image prompt ${variationIndex + 1} with Gemini...`);
    
    const model = geminiAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // Convert product buffer to base64
    const productBase64 = productBuffer.toString('base64');
    
    // Define creative scenarios/styles for variations
    const creativeScenarios = [
      'a beautiful beach scene with ocean waves',
      'a modern urban cityscape at sunset',
      'a cozy home setting with natural lighting',
      'an outdoor adventure scene in nature',
      'a vibrant party or celebration atmosphere',
      'a serene mountain landscape',
      'a trendy cafe or restaurant setting',
      'a sports or athletic environment',
      'a luxurious lifestyle setting',
      'a minimalist studio with dramatic lighting',
      'a tropical paradise setting',
      'a contemporary workspace or office'
    ];
    
    const scenario = creativeScenarios[variationIndex % creativeScenarios.length];
    
    const prompt = `Analyze this product image and create a detailed, marketing-ready image generation prompt for a social media ad creative.

Product: ${brandContext.description || 'the product'}
Brand: ${brandContext.brand || 'the brand'}

Create a prompt that describes a visually stunning, marketing-ready scene where this product is featured prominently. The scene should be: ${scenario}

The prompt should:
- Describe a complete, visually appealing scene (not just the product)
- Include the product naturally integrated into the scene
- Include the brand logo prominently but naturally
- Be suitable for professional marketing/advertising
- Create an image that would work well on Instagram, Facebook, and Twitter
- Be specific about lighting, composition, and mood
- Make it feel authentic and aspirational

Return ONLY the image generation prompt, nothing else. Make it detailed and specific.`;
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: productBase64,
          mimeType: 'image/jpeg'
        }
      },
      prompt
    ]);
    
    const response = await result.response;
    let creativePrompt = response.text().trim();
    
    // Clean up the prompt
    creativePrompt = creativePrompt
      .replace(/^["']|["']$/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    
    console.log(`✓ Creative prompt generated: ${creativePrompt.substring(0, 100)}...`);
    
    return creativePrompt;
  } catch (error) {
    console.warn('Gemini creative prompt generation failed, using fallback:', error.message);
    return generateImagePrompt(variationIndex, brandContext);
  }
}

/**
 * Generate image prompt for variation (fallback function)
 */
function generateImagePrompt(variationIndex, brandContext = null) {
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
  
  // Determine logo location based on composition
  let logoLocation = 'top corner';
  if (composition.includes('left')) logoLocation = 'left side';
  if (composition.includes('right')) logoLocation = 'right side';
  if (composition.includes('top')) logoLocation = 'top';
  if (composition.includes('bottom') || composition.includes('footer')) logoLocation = 'bottom';
  if (composition.includes('watermark')) logoLocation = 'as a subtle watermark overlay';
  if (composition.includes('integrated') || composition.includes('seamlessly')) logoLocation = 'integrated naturally into the design';
  
  // Build context-aware prompt
  const brandContextStr = brandContext ? `for ${brandContext.brand} ${brandContext.product}` : '';
  
  return `Transform this product image into a ${style} social media ad creative. Apply ${composition} layout. Integrate the brand logo prominently at ${logoLocation}. The final image should be a complete, professional ad creative ready for social media ${brandContextStr}, with the product and logo combined in a visually appealing ${style} design. Maintain product visibility and authenticity while incorporating the logo naturally. Create a cohesive composition that works as a standalone ad creative. High quality, commercial photography style, well-lit, professional composition, no text overlays, clean design suitable for Instagram, Facebook, and Twitter.`;
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
async function generateImage(prompt, productBuffer = null, apiKey = null) {
  try {
    console.log('Generating image with HuggingFace Router API...');
    
    if (!productBuffer) {
      throw new Error('Product image is required for image generation');
    }
    
    // Use provided API key or fallback to default
    const keyToUse = apiKey || HF_API_KEY;
    
    // Use imageToImage to edit the product image with the prompt
    const imageBuffer = await generateImageViaRouterImageToImage(prompt, productBuffer, keyToUse);
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
 * @param {string} prompt - Image generation prompt
 * @param {Buffer} imageBuffer - Input product image buffer
 * @param {string} apiKey - HuggingFace API key to use
 */
async function generateImageViaRouterImageToImage(prompt, imageBuffer, apiKey = null) {
  const keyToUse = apiKey || HF_API_KEY;
  
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
          'Authorization': `Bearer ${keyToUse}`,
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
              'Authorization': `Bearer ${keyToUse}`
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
 * @param {string} imagePrompt - The image generation prompt
 * @param {number} variationIndex - Index of the variation
 * @param {Object} brandContext - Brand and product context from vision analysis
 */
async function generateCaption(imagePrompt, variationIndex, brandContext = null) {
  try {
    const systemPrompt = "You are a professional copywriter specializing in social media advertising. Create engaging, compelling ad captions that drive action.";
    
    // Build context-aware prompt
    let contextInfo = '';
    if (brandContext && brandContext.brand && brandContext.brand !== 'the brand') {
      contextInfo = `The brand is ${brandContext.brand}. `;
    }
    if (brandContext && brandContext.product && brandContext.product !== 'the product') {
      contextInfo += `The product is ${brandContext.product}. `;
    }
    
    const variationStyle = variationIndex % 3 === 0 ? 'Direct and action-oriented' : 
                          variationIndex % 3 === 1 ? 'Emotional and storytelling' : 
                          'Benefit-focused and value-driven';
    
    const userPrompt = `${contextInfo}Based on this ad creative description: "${imagePrompt}"

Create ONE compelling social media ad caption (2-3 sentences) specifically for ${brandContext && brandContext.description ? brandContext.description : 'this product'} that:
- Is engaging and attention-grabbing
- Includes a clear call-to-action
- Is suitable for platforms like Instagram, Facebook, and Twitter
- Is professional but conversational
- Encourages clicks and engagement
- References the actual brand and product name when provided
- Highlights key features or benefits

Variation style: ${variationStyle}

IMPORTANT: Return ONLY ONE caption. Do not provide multiple options or numbered lists. Just return the single best caption directly.`;

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
    
    // Clean up the caption - remove numbered lists, options, etc.
    caption = caption
      .replace(/^Here are.*?:/i, '')
      .replace(/^\d+\.\s*/gm, '') // Remove numbered list items
      .replace(/^Option \d+:/i, '')
      .replace(/^"\s*/g, '') // Remove leading quotes
      .replace(/\s*"$/g, '') // Remove trailing quotes
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If caption still contains multiple options, extract just the first one
    const firstCaptionMatch = caption.match(/^([^0-9]+?)(?:\d+\.|Option|$)/);
    if (firstCaptionMatch) {
      caption = firstCaptionMatch[1].trim();
    }
    
    // Remove any remaining quotes
    caption = caption.replace(/^["']|["']$/g, '').trim();

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
