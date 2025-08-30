// Quick test to verify OpenRouter image analysis setup
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "your_key_here",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Safe Jakarta",
  },
});

// Test with a sample image
const testImageAnalysis = async () => {
  try {
    const completion = await client.chat.completions.create({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What location is shown in this image? Be specific about landmarks or buildings."
            },
            {
              type: "image_url",
              image_url: {
                url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
              }
            }
          ]
        }
      ],
      max_tokens: 100,
      temperature: 0.1
    });

    console.log("✅ Image analysis test successful!");
    console.log("Response:", completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("❌ Image analysis test failed:", error.message);
  }
};

testImageAnalysis();
