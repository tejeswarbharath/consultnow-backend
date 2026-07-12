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
      The platform has 3 categories of expert services:
      1. "Student Tutoring Services" - for academic support, tutoring, and homework for grades 1-10.
      2. "IT Career Guidance" - for tech career advice, transitions, and mentorship.
      3. "HR Services" - for workplace policy, disputes, and HR best practices.

      A user typed the following problem description:
      "${problemDescription}"

      Tasks:
      1. Classify the problem into one of the 3 categories above. Choose the closest match.
      2. Generate a brief 1-2 sentence reason for your classification.

      Return the response STRICTLY as a JSON object with the following keys. Do NOT wrap the JSON in markdown blocks like \`\`\`json or \`\`\`:
      {
        "category": "One of the 3 exact category names listed above",
        "reason": "Brief reason why",
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
      if (text.toLowerCase().includes("career") || text.toLowerCase().includes("it ")) matchedCategory = "IT Career Guidance";
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

/**
 * Roleplay as an AI Twin of a selected expert
 */
const generateExpertTwinResponse = async (message, history = [], expertId) => {
  try {
    if (!expertId) {
      throw new Error("Expert ID is required for AI Twin Chat.");
    }

    const expert = await prisma.expert.findUnique({
      where: { id: expertId }
    });

    if (!expert) {
      throw new Error("Expert not found.");
    }

    // Format chat history for Gemini API
    // Gemini history expects objects with: role ('user' | 'model') and parts: [{ text: string }]
    let formattedHistory = (history || []).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Gemini requires the chat history to start with a 'user' message.
    // We slice the history array from the first 'user' message.
    const firstUserIndex = formattedHistory.findIndex(msg => msg.role === 'user');
    if (firstUserIndex > 0) {
      formattedHistory = formattedHistory.slice(firstUserIndex);
    } else if (firstUserIndex === -1) {
      formattedHistory = [];
    }

    const systemInstruction = `
      You are the AI Twin of ${expert.name}, who is a professional expert in "${expert.subjectExpertise}" on the ConsultNow platform.
      
      Here are the expert's credentials and details:
      - Name: ${expert.name}
      - Subject Expertise: ${expert.subjectExpertise}
      - Experience: ${expert.yearsExperience} years
      - Bio/Background: ${expert.bio || expert.marketingSnippet || 'No additional bio provided.'}

      Your instructions:
      1. Roleplay strictly as the AI Twin of ${expert.name}. Speak in their professional, supportive, and expert voice.
      2. Help the user clarify their challenges, prepare questions, or get initial educational/operational thoughts on their query.
      3. Keep your responses relatively concise (1-3 paragraphs) as this is a quick chat interface.
      4. Since you are a simulation, if the client asks complex, deep-dive questions or requests direct service action, gently suggest they book a full, live, face-to-face slot with the real ${expert.name} on the ConsultNow booking page.
      5. Make it clear you are the AI Twin helper.
    `;

    // Start Gemini Chat session with System Instructions
    const genModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction
    });

    const chatSession = genModel.startChat({
      history: formattedHistory
    });

    const result = await chatSession.sendMessage(message);
    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error("AI Expert Twin Chat generation failed:", error);
    return "Hi, I am having a bit of trouble retrieving my thoughts right now. Please try again in a moment, or you can book a live consultation with the real expert directly!";
  }
};

// FIX 3: Ensure all functions are correctly exported
module.exports = {
  triageProblem,
  generateMarketing,
  generateExpertSummaries,
  generateExpertTwinResponse
};