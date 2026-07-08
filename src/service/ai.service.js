const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../prisma');

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
 * Triage user's problem to recommend an expert category and check for emergencies
 */
const triageProblem = async (problemDescription) => {
  try {
    const model = getModel();
    const prompt = `
      You are an AI support agent for ConsultNow, a professional services platform.
      The platform has 5 categories of expert services:
      1. "Student Tutoring Services" - for academic support, tutoring, and homework for grades 1-10.
      2. "Medical Advice" - for general health, wellness, and non-emergency medical queries.
      3. "IT Career Guidance" - for tech career advice, transitions, and mentorship.
      4. "Legal Advice" - for general legal information, rights, and clarification.
      5. "HR Services" - for workplace policy, disputes, and HR best practices.

      A user typed the following problem description:
      "${problemDescription}"

      Tasks:
      1. Classify the problem into one of the 5 categories above. Choose the closest match.
      2. Determine if this is a high-risk emergency.
         - For "Medical Advice": check if there is an emergency, severe trauma, life-threatening symptoms (e.g., chest pain, shortness of breath, severe bleeding, loss of consciousness, suicidal thoughts or self-harm).
         - For "Legal Advice": check if there is an immediate legal emergency (e.g., active arrest, search warrant, jail, immediate physical safety danger).
      3. Generate a brief 1-2 sentence reason for your classification.

      Return the response STRICTLY as a JSON object with the following keys. Do NOT wrap the JSON in markdown blocks like \`\`\`json or \`\`\`:
      {
        "category": "One of the 5 exact category names listed above",
        "reason": "Brief reason why",
        "isEmergency": true or false,
        "disclaimer": "Emergency warning message if isEmergency is true, otherwise empty string"
      }
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.warn("Failed to parse Gemini triage response as JSON, fallback parsing", parseError, "Text was:", text);
      let matchedCategory = "Student Tutoring Services";
      if (text.toLowerCase().includes("medical")) matchedCategory = "Medical Advice";
      else if (text.toLowerCase().includes("career") || text.toLowerCase().includes("it ")) matchedCategory = "IT Career Guidance";
      else if (text.toLowerCase().includes("legal") || text.toLowerCase().includes("attorney")) matchedCategory = "Legal Advice";
      else if (text.toLowerCase().includes("hr ") || text.toLowerCase().includes("human resource")) matchedCategory = "HR Services";

      return {
        category: matchedCategory,
        reason: "Mapped based on text keywords.",
        isEmergency: false,
        disclaimer: ""
      };
    }
  } catch (error) {
    console.error("AI Triage Failed. Providing fallback:", error.message);
    return {
      category: "HR Services",
      reason: "Our AI is currently experiencing high traffic. Please browse categories manually.",
      isEmergency: false,
      disclaimer: ""
    };
  }
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

/**
 * Generates custom 1-sentence recommendation tags for experts based on the search query
 */
const generateExpertSummaries = async (query, experts) => {
  try {
    const model = getModel();
    const formattedExperts = experts.map(e => ({
      id: e.id,
      name: e.name,
      bio: e.bio || '',
      marketingSnippet: e.marketingSnippet || '',
      subjectExpertise: e.subjectExpertise
    }));

    const prompt = `
      A user is searching for an expert with this query/problem description:
      "${query}"

      Here is the list of available experts:
      ${JSON.stringify(formattedExperts)}

      For each expert in the list, generate a dynamic, 1-sentence recommendation tag (max 15 words) explaining why they are recommended (or how they can help) for the user's specific problem.
      If their profile does not directly match the query, write a general supportive tagline based on their bio/snippet.
      
      Return the response STRICTLY as a JSON object mapping expert IDs to their custom summaries. Do not wrap the JSON in markdown blocks like \`\`\`json.
      Example:
      {
        "expert-uuid-1": "Highly recommended for Cloud Computing transitions based on your query."
      }
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Expert Summaries Failed:", error);
    return {};
  }
};

// FIX 3: Ensure all functions are correctly exported
module.exports = {
  triageProblem,
  generateMarketing,
  generateExpertSummaries
};