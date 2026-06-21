const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;

// FIX 1: Added SSL configuration to silence the libpq-ssl warning required by Neon Tech DBs
const pool = new Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Get the generative model
 */
const getModel = (modelName = 'gemini-2.5-flash') => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
  }
  return genAI.getGenerativeModel({ model: modelName });
};

/**
 * Helper: Delay execution
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Execute Gemini call with Exponential Backoff
 */
const generateWithRetry = async (model, prompt, maxRetries = 3) => {
  let baseDelay = 2000; // Start with a 2-second delay

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return await result.response;
    } catch (error) {
      const isRateLimit = error.status === 429 || 
                          (error.message && error.message.toLowerCase().includes('too high')) ||
                          (error.message && error.message.toLowerCase().includes('overloaded'));

      if (isRateLimit && i < maxRetries - 1) {
        console.warn(`[ConsultNow AI] Traffic high. Retrying in ${baseDelay / 1000}s... (Attempt ${i + 1} of ${maxRetries})`);
        await delay(baseDelay);
        baseDelay *= 2; // Double the wait time for the next attempt
      } else {
        // If it's not a rate limit error, or we've run out of retries, throw it.
        throw error; 
      }
    }
  }
};

/**
 * FIX 2: Restored the triageProblem function that was missing
 * Triage user's problem to recommend an expert category
 */
const triageProblem = async (problemDescription) => {
  const model = getModel();
  const prompt = `
    A user has the following problem:
    "${problemDescription}"
    
    Recommend a specific expert category (e.g., Legal, IT, Medical, Financial, Mental Health, Career Coaching) that would be most suitable to help with this problem.
    Keep your response short and structured. State the recommended category clearly and provide a brief 1-2 sentence reason why.
  `;

  const response = await generateWithRetry(model, prompt);
  return response.text();
};

/**
 * Generate marketing bio and snippet for an expert
 */
const generateMarketing = async (skills, expertId) => {
  const model = getModel();
  const prompt = `
    An expert has the following skills and background:
    "${skills}"
    
    Generate the following to help them market their services on our professional platform:
    1. A professional bio (approx 3-4 sentences).
    2. A catchy marketing snippet/tagline to attract clients.
    
    Return the response strictly as a JSON object with two keys: "bio" and "marketingSnippet".
    Do not wrap the JSON in markdown blocks like \`\`\`json.
  `;

  const response = await generateWithRetry(model, prompt);
  let text = response.text();
  
  text = text.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
  
  let marketingMaterial;

  try {
    marketingMaterial = JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse Gemini response as JSON. Falling back to raw text.", error);
    marketingMaterial = {
      bio: text,
      marketingSnippet: "Professional services available."
    };
  }

  try {
    await prisma.expert.update({
      where: { id: expertId },
      data: {
        bio: marketingMaterial.bio,
        marketingSnippet: marketingMaterial.marketingSnippet
      }
    });
    return marketingMaterial;
  } catch (dbError) {
    console.error("Database update failed inside generateMarketing:", dbError);
    throw new Error("Failed to save generated marketing profile to database.");
  }
};

// FIX 3: Ensure both functions are correctly exported
module.exports = {
  triageProblem,
  generateMarketing
};