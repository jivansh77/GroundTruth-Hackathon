# H-003 | The AI Creative Studio

**Track:** Generative AI & Marketing Tech

An Auto-Creative Engine that automatically generates multiple ad creative variations from brand assets using Generative AI.

---

## 1. The Problem (Real World Scenario)

Businesses and marketing teams spend **weeks** designing variations of the same image content for their advertising campaigns. This process is:

- **Time-consuming**: Designers manually create multiple variations for A/B testing
- **Resource-intensive**: Requires skilled designers and design tools
- **Repetitive**: Same brand assets need to be reworked in different styles and compositions
- **Costly**: High design costs for multiple creative variations
- **Slow**: Delays campaign launches while waiting for design iterations

**Real-world impact**: A marketing team needs 10+ ad creative variations for a product launch campaign. Traditionally, this would take:
- 2-3 designers working for 1-2 weeks
- Multiple design iterations and approvals
- High costs ($5,000-$15,000+)
- Delayed campaign timelines

Our solution automates this entire process, generating professional ad creatives in minutes instead of weeks.

---

## 2. Expected End Result

### Input
- **Brand Logo**: Company logo image (any format: JPG, PNG, WEBP, etc.)
- **Product Image**: Product photo or image (any format)

### Process
The system automatically:
1. Analyzes the uploaded brand assets
2. Generates **10+ unique ad creative variations** with different:
   - Styles (minimalist, vibrant, elegant, playful, etc.)
   - Compositions (product centered, split screen, logo placement, etc.)
   - Visual treatments
3. Creates **matching ad captions** for each creative using LLM
4. Packages everything into a downloadable ZIP file

### Output
A ZIP file containing:
- **10+ high-resolution images** (1024x1024px)
  - Named: `creative-1.jpg`, `creative-2.jpg`, etc.
- **10+ matching caption files** (text files)
  - Named: `creative-1.txt`, `creative-2.txt`, etc.
  - Each caption is optimized for social media platforms (Instagram, Facebook, Twitter)

### Use Cases
- **E-commerce**: Generate product ad variations for social media campaigns
- **Marketing Agencies**: Rapid creative production for client campaigns
- **Small Businesses**: Professional ad creatives without design teams
- **A/B Testing**: Multiple variations for performance testing
- **Seasonal Campaigns**: Quick generation of themed ad variations

---

## 3. Technical Approach

### Architecture Overview

```
┌─────────────┐
│   Frontend  │  React + Vite
│  (Upload UI)│  ──────────────┐
└──────┬──────┘                 │
       │                        │
       │ POST /api/generate     │
       │ (logo + product)       │
       ▼                        │
┌───────────────────────────────┘
│   Backend Server              │
│   (Express.js)                │
│                               │
│   1. Receive uploads          │
│   2. Generate 10+ images      │──┐
│   3. Generate 10+ captions    │  │
│   4. Create ZIP file          │  │
│   5. Return ZIP download      │  │
└───────────────────────────────┘  │
       │                            │
       │ API Calls                  │
       ▼                            │
┌───────────────────────────────────┘
│   AI Services                    │
│                                  │
│   Image Generation:              │
│   • HuggingFace FLUX.1-dev       │
│   • fal-ai provider (GPU)       │
│   • Image-to-Image editing       │
│                                  │
│   Caption Generation:            │
│   • HuggingFace Llama-3.1        │
│   • Router API                   │
└──────────────────────────────────┘
```

### Image Generation Flow

1. **Image Processing**:
   - Upload logo and product images
   - Convert to appropriate format
   - Generate 10+ unique prompts with different styles and compositions

2. **AI Image Generation**:
   - Use **HuggingFace FLUX.1-dev** model via **fal-ai provider** (GPU-powered)
   - Each variation uses a different style prompt:
     - Modern minimalist
     - Vibrant and colorful
     - Elegant and sophisticated
     - Playful and energetic
     - Professional corporate
     - And 7+ more styles
   - Each variation uses different composition:
     - Product centered with logo in corner
     - Split screen design
     - Logo integrated seamlessly
     - And 9+ more compositions

3. **Image Post-Processing**:
   - Resize to 1024x1024px
   - Optimize quality (90% JPEG)
   - Save to temporary directory

### Caption Generation Flow

1. **Prompt Engineering**:
   - Create context-aware prompts based on image description
   - Include variation style (direct, emotional, benefit-focused)
   - Optimize for social media platforms

2. **LLM Generation**:
   - Use **HuggingFace Llama-3.1-8B-Instruct** via Router API
   - Generate 2-3 sentence captions
   - Include clear call-to-action
   - Optimize for engagement

3. **Caption Post-Processing**:
   - Clean up formatting
   - Remove unwanted brackets/parentheses
   - Save as text files

### ZIP File Generation

- Use `archiver` library to create ZIP file
- Include all generated images and captions
- Maximum compression (level 9)
- Stream directly to client for download

---

## 4. Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Axios** - HTTP client for API calls

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Multer** - File upload handling
- **Sharp** - Image processing and optimization
- **Archiver** - ZIP file creation

### AI/ML Services
- **HuggingFace Inference API** - AI model hosting
  - **FLUX.1-dev** - Text-to-image generation (via fal-ai provider)
  - **Llama-3.1-8B-Instruct** - Text generation for captions
- **fal-ai Provider** - GPU-powered inference for image generation
- **HuggingFace Router API** - Unified API endpoint

### Development Tools
- **dotenv** - Environment variable management
- **nodemon** - Development auto-reload

---

## 5. Challenges & Learnings

### Challenges Faced

1. **API Endpoint Deprecation**
   - **Problem**: HuggingFace deprecated `api-inference.huggingface.co` in favor of `router.huggingface.co`
   - **Solution**: Updated to use router endpoint with provider specification
   - **Learning**: Always check for API deprecation notices and migration guides

2. **Model Availability**
   - **Problem**: FLUX.1-dev requires GPU, not available through CPU-only hf-inference provider
   - **Solution**: Used `fal-ai` provider which supports GPU models
   - **Learning**: Different providers have different capabilities; choose based on model requirements

3. **Image Format Handling**
   - **Problem**: Different APIs expect different formats (Buffer, Blob, base64)
   - **Solution**: Implemented format conversion layer with fallbacks
   - **Learning**: Standardize on one format internally, convert at API boundaries

4. **Provider Configuration**
   - **Problem**: Specifying provider in HfInference client wasn't working with deprecated endpoint
   - **Solution**: Direct router endpoint calls with provider in request body/headers
   - **Learning**: Sometimes direct API calls are more reliable than SDK abstractions

5. **Error Handling**
   - **Problem**: API errors weren't providing clear feedback
   - **Solution**: Implemented comprehensive error handling with fallbacks
   - **Learning**: Always have fallback strategies for external API dependencies

### Key Learnings

- **Provider Selection**: GPU models require specialized providers (fal-ai) rather than CPU-only providers
- **API Evolution**: SDKs may lag behind API changes; direct API calls can be more reliable
- **Format Flexibility**: Support multiple input/output formats for better compatibility
- **Error Recovery**: Implement graceful degradation and clear error messages
- **Performance**: Batch processing and parallel generation can significantly improve speed

---

## 6. Visual Proof

### Application Interface

The application provides a clean, modern interface:

```
┌─────────────────────────────────────────┐
│      Content Studio                     │
│  Upload your logo and product image     │
│  to generate 10+ ad creative variations│
└─────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐
│  Brand Logo  │  │ Product Image│
│   [Upload]   │  │   [Upload]   │
└──────────────┘  └──────────────┘

        [Generate Ad Creatives]
              ↓
    [Progress: 45%...]
              ↓
    [Download ZIP File]
```

### Output Structure

```
ad-creatives-1234567890.zip
├── creative-1.jpg    (1024x1024, modern minimalist style)
├── creative-1.txt    (matching caption)
├── creative-2.jpg    (1024x1024, vibrant colorful style)
├── creative-2.txt    (matching caption)
├── creative-3.jpg    (1024x1024, elegant sophisticated style)
├── creative-3.txt    (matching caption)
└── ... (10+ variations)
```

### Example Variations

Each generated creative features:
- **Unique Style**: Different visual treatment (minimalist, vibrant, elegant, etc.)
- **Different Composition**: Varied layout and positioning
- **Brand Integration**: Logo and product seamlessly incorporated
- **Professional Quality**: High-resolution, ready for social media

---

## 7. How to Run

### Prerequisites

- **Node.js** v18 or higher
- **npm** (comes with Node.js)
- **HuggingFace API Key** ([Get one here](https://huggingface.co/settings/tokens))

### Installation Steps

1. **Clone/Navigate to the project:**
   ```bash
   cd GroundTruth
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

4. **Set up environment variables:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   
   Edit `.env` and add your HuggingFace API key:
   ```env
   HF_API_KEY=your_huggingface_api_key_here
   PORT=5001
   ```

### Running the Application

1. **Start the backend server:**
   ```bash
   cd backend
   npm start
   # or for development with auto-reload:
   npm run dev
   ```
   
   You should see:
   ```
   ✓ HF_API_KEY loaded
   Server running on port 5001
   Health check: http://localhost:5001/api/health
   ```

2. **Start the frontend (in a new terminal):**
   ```bash
   npm run dev
   ```
   
   You should see:
   ```
   VITE v6.x.x  ready in xxx ms
   ➜  Local:   http://localhost:5173/
   ```

3. **Open your browser:**
   Navigate to `http://localhost:5173`

### Usage

1. **Upload Images:**
   - Click on "Brand Logo" area and select your logo image
   - Click on "Product Image" area and select your product image
   - Both images will show previews

2. **Generate Creatives:**
   - Click "Generate Ad Creatives" button
   - Wait for generation (typically 2-5 minutes for 10+ variations)
   - Progress bar will show generation status

3. **Download Results:**
   - Once complete, ZIP file will automatically download
   - Contains all generated images and captions
   - Ready to use for your marketing campaigns!

### API Endpoints

- `GET /api/health` - Health check endpoint
- `POST /api/generate-creatives` - Generate ad creatives
  - **Request**: `multipart/form-data` with `logo` and `product` files
  - **Response**: ZIP file (binary)

### Configuration

**Number of Variations:**
- Default: 1 (for testing)
- Production: 12
- Edit `NUM_VARIATIONS` in `backend/services/creativeService.js`

**Image Settings:**
- Resolution: 1024x1024px
- Format: JPEG
- Quality: 90%

**Caption Settings:**
- Length: 2-3 sentences
- Style: Social media optimized
- Includes: Call-to-action

### Troubleshooting

**API Errors:**
- Verify your HuggingFace API key is correct
- Check API key has sufficient quota/credits
- Ensure API key has access to fal-ai provider

**Upload Errors:**
- Maximum file size: 10MB per image
- Supported formats: JPG, PNG, WEBP, GIF
- Ensure images are valid image files

**Generation Fails:**
- Check backend console for detailed error messages
- Verify network connection
- Check HuggingFace API status

**Port Already in Use:**
- Backend default: 5001 (change in `.env` if needed)
- Frontend default: 5173 (change in `vite.config.js` if needed)

---

## Project Structure

```
GroundTruth/
├── backend/
│   ├── server.js              # Express server
│   ├── services/
│   │   └── creativeService.js # Image & caption generation
│   ├── uploads/              # Temporary upload storage
│   ├── temp_generations/     # Temporary generation storage
│   ├── package.json
│   └── .env                  # Environment variables
├── src/
│   ├── pages/
│   │   └── ContentStudio.jsx # Main UI component
│   ├── App.jsx
│   └── main.jsx
├── package.json
├── vite.config.js
└── README.md
```

---

## License

This project is part of the H-003 challenge for Generative AI & Marketing Tech track.

---

## Acknowledgments

- **HuggingFace** for providing AI models and inference infrastructure
- **fal-ai** for GPU-powered inference provider
- **FLUX.1-dev** model by Black Forest Labs
- **Llama-3.1** model by Meta
