### NOTE - I RAN OUT OF CREDITS WHEN GENERATING THE TEXT FOR CAPTIONS 5-10, which is why it went to fallback

# Technical Implementation Notes

## Vision Model: Gemini 2.0 Flash

I chose Google Gemini 2.0 Flash for vision analysis instead of the traditional HuggingFace vision models. The main reason is that Gemini gives me much better results when it comes to understanding what's actually in the images. When I upload a logo and product image, Gemini can accurately identify brand names like "Pepsi" and understand the product type, which is crucial for generating relevant content.

What I really like about Gemini is how it handles context. It doesn't just describe what it sees - it understands the relationship between the logo and product, and can extract meaningful information that I can actually use. This is especially important for the creative prompt generation part, where I need the AI to come up with marketing-ready scenes based on what the product actually is.

The vision analysis does three main things: it extracts the brand name and product info from the uploaded images, uses that to generate captions that actually mention the real brand (not generic placeholders), and creates creative image prompts that make sense for the product. For example, if it's a Pepsi bottle, Gemini might suggest "Pepsi bottle on a beach with waves" instead of just "a beverage on a table" - much more marketing-ready.

## Why I Chose Node.js Over Python

I know Python really well and it would have been the obvious choice for AI/ML work. But I went with Node.js and JavaScript for the backend, and here's why it actually made sense for this project.

First, my frontend is already in JavaScript with React, so keeping everything in the same language means I'm not constantly switching contexts. It made it more efficient.

Node.js handles async operations. This application makes a ton of sequential API calls - first Gemini analyzes the images, then I generate the image, then I poll for results, then I generate captions. Node.js's event-driven architecture is perfect for this. The async/await syntax makes complex workflows like polling for image generation results actually readable and maintainable. In Python, I'd be dealing with more boilerplate for the same thing.

I also wanted real-time capabilities. Node.js is built for this - if I want to show progress updates during image generation or handle multiple users at once, Node.js handles it naturally. The WebSocket support means I can push live updates without much hassle.

Performance-wise, this backend is mostly I/O-bound. I'm making API calls, handling file uploads, processing images - that's exactly what Node.js excels at. It's not doing heavy computation, so Node.js's single-threaded event loop is actually perfect for this use case.

And honestly, development speed matters. With nodemon, I get instant feedback when I make changes. The iteration cycle is faster, and there's less boilerplate compared to Python frameworks for REST APIs. When you're building something for a hackathon, speed of development is crucial.

## What I Built

The vision analysis uses Gemini to look at the uploaded logo and product images and figure out what brand and product they are. If Gemini can't figure it out clearly, the system falls back to whatever brand and product names the user provides manually.

For image generation, I'm using Gemini to create the actual prompts. Instead of just saying "edit this product image," Gemini analyzes the product and comes up with creative, marketing-ready scenes. So for a Pepsi bottle, it might generate a prompt like "Pepsi bottle on a beautiful beach with ocean waves in the background, golden hour lighting, professional product photography style." This creates much better results than just editing the original product photo.

I'm using the Wavespeed FLUX.2-dev model through HuggingFace's router for the actual image generation. The images come back as async jobs, so I built a polling system that checks the job status, handles errors, and manages timeouts properly.

The captions are context-aware too. They actually mention the real brand and product names, not generic placeholders. Each creative gets one focused caption, not multiple options. I vary the style - some are action-oriented, some are more emotional, some focus on benefits.

For image processing, I'm using Sharp to handle resizing and format conversion. It maintains quality while optimizing for social media platforms, and it handles different formats like JPEG, PNG, and WebP without issues.

## Technical Details

I'm using Node.js with Express for the backend, Google Gemini 2.0 Flash for vision and creative prompts, Wavespeed FLUX.2-dev via HuggingFace Router for image generation, Sharp for image processing, Multer for file uploads, and Archiver for creating the ZIP files.

One important architectural decision was using HuggingFace router endpoints directly instead of their deprecated InferenceClient. This ensures reliability and avoids the deprecation warnings. I also kept the code modular with a separate creativeService.js file, which makes everything cleaner and easier to maintain.

Error handling is comprehensive - there are fallbacks at every step. If vision analysis fails, it uses user input. If image generation fails, it provides clear error messages. And I make sure to clean up all temporary files and uploaded images properly.
