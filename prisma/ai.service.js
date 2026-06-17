const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini client using the environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use the gemini-1.5-flash model for fast general text generation tasks
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Helper to retry Gemini API calls on 503 Service Unavailable
 */
async function generateContentWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      if (error.status === 503 && attempt < maxRetries) {
        console.warn(`[Gemini API] 503 Service Unavailable. Retrying attempt ${attempt} of ${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

/**
 * Triages a user's problem description and recommends an expert category.
 * @param {string} problemDescription - The user's problem description.
 * @returns {Promise<string>} The recommended category.
 */
async function triageProblem(problemDescription) {
  const prompt = `
    You are an AI support agent for ConsultNow, a professional services platform.
    Analyze the following user problem description and recommend the single most appropriate professional service category from this list: Legal, IT, Medical, Financial, Education, Real Estate, Marketing.
    
    User Problem: "${problemDescription}"
    
    Only return the category name, nothing else.
  `;

  const result = await generateContentWithRetry(prompt);
  const response = result.response;
  return response.text().trim();
}

/**
 * Generates marketing material (bio and snippet) based on an expert's skills.
 * @param {string} skills - Raw skills input by the expert.
 * @returns {Promise<Object>} An object containing the generated bio and marketing snippet.
 */
async function generateMarketingMaterial(skills) {
  const prompt = `
    You are an expert marketing copywriter for professional service providers.
    Based on the following list of skills/details provided by a professional, generate a professional bio (about 3-4 sentences) and a short, catchy marketing snippet (1-2 sentences) for their ConsultNow profile.

    Skills/Details: "${skills}"

    Respond strictly with a JSON object format exactly like this:
    {"bio": "...", "snippet": "..."}
  `;

  const result = await generateContentWithRetry(prompt);
  let text = result.response.text().trim();
  if (text.startsWith('\`\`\`json')) {
      text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
  }
  return JSON.parse(text);
}

module.exports = { triageProblem, generateMarketingMaterial };