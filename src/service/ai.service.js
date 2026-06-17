const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Get the generative model
 * @param {string} modelName - The name of the model to use
 * @returns {object} The generative model instance
 */
const getModel = (modelName = 'gemini-2.5-flash') => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
  }
  return genAI.getGenerativeModel({ model: modelName });
};

/**
 * Triage user's problem to recommend an expert category
 * @param {string} problemDescription - User's problem description
 * @returns {Promise<string>} Structured AI response recommending a category
 */
const triageProblem = async (problemDescription) => {
  const model = getModel();
  const prompt = `
    A user has the following problem:
    "${problemDescription}"
    
    Recommend a specific expert category (e.g., Legal, IT, Medical, Financial, Mental Health, Career Coaching) that would be most suitable to help with this problem.
    Keep your response short and structured. State the recommended category clearly and provide a brief 1-2 sentence reason why.
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
};

/**
 * Generate marketing bio and snippet for an expert
 * @param {object} expertDetails - Basic expert details and skills
 * @returns {Promise<object>} Generated bio and marketing snippet
 */
const generateMarketing = async (skills) => {
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

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();
  
  // Clean up potential markdown formatting from the AI response
  text = text.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
  
  try {
    return JSON.parse(text);
  } catch (error) {
    // Fallback if AI doesn't return perfect JSON
    return {
      bio: text,
      marketingSnippet: "Professional services available."
    };
  }
};

module.exports = {
  triageProblem,
  generateMarketing
};
