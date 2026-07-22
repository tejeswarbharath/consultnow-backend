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
const generateWithRetry = async (model, prompt, maxRetries = 4) => {
  let baseDelay = 2000; // Start with a 2-second delay

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return await result.response;
    } catch (error) {
      const status = error.status || (error.response && error.response.status);
      const msg = (error.message || '').toLowerCase();
      const isTransient = status === 429 || status === 503 || status === 500 ||
                          msg.includes('too high') ||
                          msg.includes('overloaded') ||
                          msg.includes('high demand') ||
                          msg.includes('service unavailable') ||
                          msg.includes('unavailable');

      if (isTransient && i < maxRetries - 1) {
        console.warn(`[ConsultNow AI] Gemini API busy/unavailable (${status || '503'}). Retrying in ${baseDelay / 1000}s... (Attempt ${i + 1} of ${maxRetries})`);
        await delay(baseDelay);
        baseDelay *= 2; // Double the wait time for the next attempt
      } else {
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

      Return the response STRICTLY as a JSON object with the following keys. Do NOT wrap the JSON in markdown code blocks:
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
    An expert has provided the following skills, experience, and background:
    "${skills}"
    
    Generate the following to help them market their services on our professional platform:
    1. A professional bio (approx 3-4 sentences).
    2. A realistic marketing snippet/tagline to attract clients.
    
    CRITICAL TONE & STYLE GUIDELINES:
    - Tone: Highly realistic, grounded, authentic, and professional.
    - Avoid: Artistic fluff, dramatic/flowery language, poetic metaphors, or exaggerated buzzwords (e.g. do NOT use "visionary master", "symphony of excellence", "crafting digital destiny", etc.).
    - Impact: The client reading this should feel like a genuine, approachable, down-to-earth human expert is speaking directly to them right now. Focus on clear skills, practical outcomes, and real-world experience.

    Return the response strictly as a JSON object with two keys: "bio" and "marketingSnippet".
    Do not wrap the JSON in markdown code blocks.
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
      
      Return the response STRICTLY as a JSON object mapping expert IDs to their custom summaries. Do not wrap the JSON in markdown code blocks.
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
      1. Roleplay strictly as the AI Twin of ${expert.name}. Speak in a grounded, realistic, down-to-earth, and professional human voice (avoid artistic fluff, flowery metaphors, or dramatic hyperbole).
      2. Make the audience feel that the expert is right here, right now, responding with real-world clarity and practical advice.
      3. Help the user clarify their challenges, prepare questions, or get initial educational/operational thoughts on their query.
      4. Keep your responses relatively concise (1-3 paragraphs) as this is a quick chat interface.
      5. Since you are an AI simulation, if the client asks complex, deep-dive questions or requests direct service action, gently suggest they book a full, live slot with the real ${expert.name} on the ConsultNow booking page.
      6. Make it clear you are the AI Twin helper.
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

/**
 * Generate a 3-step structured consultation preparation agenda for clients
 */
const generateAgenda = async (problemDetails, expertSubject) => {
  try {
    const model = getModel();
    const prompt = `
      A client is preparing for a live consultation with an expert in "${expertSubject || 'General Consulting'}".
      The client described their issue/goal as:
      "${problemDetails}"

      Generate a clear, realistic 3-step preparation agenda for the client to bring into their consultation.
      Focus on practical, grounded items (e.g. what documents to prepare, what specific questions to ask, key objectives).

      Return strictly a JSON object formatted as:
      {
        "agenda": [
          "Step 1: ...",
          "Step 2: ...",
          "Step 3: ..."
        ]
      }
      Do not wrap in markdown \`\`\`json.
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("generateAgenda failed:", error);
    return {
      agenda: [
        "1. Write down your top 3 specific goals for this consultation.",
        "2. Gather any relevant documents or code/resume references.",
        "3. Prepare specific questions about next steps and actionable solutions."
      ]
    };
  }
};

/**
 * Generate a 30-second intake briefing digest for an expert before a call
 */
const generateBriefing = async (clientNotes, bookingType) => {
  try {
    const model = getModel();
    const prompt = `
      An expert is about to start a "${bookingType || 'Consultation'}" session with a client.
      The client submitted the following initial notes:
      "${clientNotes}"

      Summarize this into a concise 30-second pre-call briefing digest for the expert.

      Return strictly a JSON object:
      {
        "summary": "Brief 1-2 sentence core problem overview",
        "keyFocus": "Main priority area for the call",
        "suggestedApproach": "Recommended starting point for the expert"
      }
      Do not wrap in markdown \`\`\`json.
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("generateBriefing failed:", error);
    return {
      summary: "Client requires assistance with their submitted topic.",
      keyFocus: "Clarify primary goals and immediate bottlenecks.",
      suggestedApproach: "Start with a 2-minute goal alignment before diving into solutions."
    };
  }
};

/**
 * Generate a post-consultation follow-up email draft and session summary
 */
const generateFollowUp = async (clientName, topic, notes) => {
  try {
    const model = getModel();
    const prompt = `
      An expert completed a consultation session with client "${clientName || 'Client'}".
      Topic: "${topic || 'Consultation'}"
      Key notes/discussion points: "${notes || 'General consultation review'}"

      Generate a professional, realistic post-consultation follow-up email draft and action summary.

      Return strictly a JSON object:
      {
        "subject": "Follow-up: Summary & Next Steps for our Consultation",
        "emailBody": "Realistic, warm, professional email body...",
        "actionItems": [
          "Action 1...",
          "Action 2..."
        ]
      }
      Do not wrap in markdown \`\`\`json.
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("generateFollowUp failed:", error);
    return {
      subject: `Follow-up & Next Steps - ConsultNow Session`,
      emailBody: `Hi ${clientName || 'there'},\n\nThank you for connecting with me today! Below is a summary of our discussion along with recommended next steps.`,
      actionItems: [
        "Review the discussion points from our session.",
        "Implement agreed-upon preliminary action items."
      ]
    };
  }
};

/**
 * Analyze experience and market benchmarks to recommend expert hourly rate
 */
const recommendPricing = async (yearsExperience, subjectExpertise, currentRate) => {
  try {
    const model = getModel();
    const prompt = `
      An expert has the following profile:
      - Subject Expertise: "${subjectExpertise}"
      - Years of Experience: ${yearsExperience}
      - Current Rate: ${currentRate ? currentRate + ' INR/hr' : 'Not set'}

      Provide a realistic market pricing benchmark and rate recommendation in INR (Indian Rupees).

      Return strictly a JSON object:
      {
        "recommendedPrice": number (e.g. 1500),
        "priceRange": "minPrice - maxPrice INR",
        "rationale": "Clear, grounded 2-sentence rationale based on market demand and experience."
      }
      Do not wrap in markdown \`\`\`json.
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("recommendPricing failed:", error);
    const baseRate = Math.max(500, (yearsExperience || 2) * 300);
    return {
      recommendedPrice: baseRate,
      priceRange: `${Math.round(baseRate * 0.8)} - ${Math.round(baseRate * 1.3)} INR`,
      rationale: "Based on standard market rates for experts with similar background and experience."
    };
  }
};

// Export all AI methods
module.exports = {
  triageProblem,
  generateMarketing,
  generateExpertSummaries,
  generateExpertTwinResponse,
  generateAgenda,
  generateBriefing,
  generateFollowUp,
  recommendPricing
};