const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../prisma');

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Get the generative model with optional JSON response format
 */
const getModel = (modelName = 'gemini-2.5-flash', jsonMode = false) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
  }
  const config = { model: modelName };
  if (jsonMode) {
    config.generationConfig = { responseMimeType: "application/json" };
  }
  return genAI.getGenerativeModel(config);
};

/**
 * Helper: Delay execution
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Robustly parse JSON from Gemini text response
 */
const parseGeminiJson = (rawText) => {
  if (!rawText) return {};
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  } else {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      text = text.substring(firstBracket, lastBracket + 1);
    }
  }

  return JSON.parse(text);
};

/**
 * Helper: Execute Gemini call with Exponential Backoff
 */
const generateWithRetry = async (model, prompt, maxRetries = 3) => {
  let baseDelay = 1000; // Start with a 1-second delay for faster responsiveness

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
    const model = getModel('gemini-2.5-flash', true);
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

      Return the response STRICTLY as a JSON object with the following keys:
      {
        "category": "One of the 3 exact category names listed above",
        "reason": "Brief reason why"
      }
    `;

    const response = await generateWithRetry(model, prompt);
    const text = response.text().trim();
    
    try {
      return parseGeminiJson(text);
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
  const model = getModel('gemini-2.5-flash', true);
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
  `;

  const response = await generateWithRetry(model, prompt);
  const rawText = response.text();
  
  let marketingMaterial;

  try {
    marketingMaterial = parseGeminiJson(rawText);
    if (!marketingMaterial.bio && marketingMaterial.professionalBio) {
      marketingMaterial.bio = marketingMaterial.professionalBio;
    }
    if (!marketingMaterial.marketingSnippet && marketingMaterial.serviceDescription) {
      marketingMaterial.marketingSnippet = marketingMaterial.serviceDescription;
    }
  } catch (error) {
    console.warn("Failed to parse Gemini response as JSON. Falling back to raw text.", error);
    marketingMaterial = {
      bio: rawText,
      marketingSnippet: "Professional services available."
    };
  }

  if (expertId) {
    try {
      await prisma.expert.update({
        where: { id: expertId },
        data: {
          bio: marketingMaterial.bio,
          marketingSnippet: marketingMaterial.marketingSnippet
        }
      });
    } catch (dbError) {
      console.warn("Database update warning inside generateMarketing:", dbError.message);
    }
  }

  return marketingMaterial;
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
    const model = getModel('gemini-2.5-flash', true);
    const prompt = `
      An expert has the following profile:
      - Subject Expertise: "${subjectExpertise || 'Consultant'}"
      - Years of Experience: ${yearsExperience || 2}
      - Current Rate: ${currentRate ? currentRate + ' INR/hr' : 'Not set'}

      Provide a realistic market pricing benchmark and rate recommendation in INR (Indian Rupees).

      Return strictly a JSON object:
      {
        "recommendedPrice": 1500,
        "priceRange": "1200 - 1800 INR",
        "rationale": "Clear, grounded 2-sentence rationale based on market demand and experience."
      }
    `;

    const response = await generateWithRetry(model, prompt);
    const rawText = response.text();
    return parseGeminiJson(rawText);
  } catch (error) {
    console.error("recommendPricing failed:", error);
    const years = Number(yearsExperience) || 2;
    const baseRate = Math.max(500, years * 300);
    return {
      recommendedPrice: baseRate,
      priceRange: `${Math.round(baseRate * 0.8)} - ${Math.round(baseRate * 1.3)} INR`,
      rationale: "Based on standard market rates for experts with similar background and experience."
    };
  }
};

/**
 * Generate a complete, high-converting AI-driven SEO profile for an Expert using Gemini
 */
const generateSeoProfile = async (expertId) => {
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: expertId }
    });

    if (!expert) {
      throw new Error(`Expert with ID ${expertId} not found`);
    }

    const model = getModel();
    const prompt = `
      You are an elite programmatic SEO and copywriting specialist for ConsultNow.
      Create an optimized, high-ranking public profile page for the following expert:
      - Name: "${expert.name}"
      - Subject Expertise: "${expert.subjectExpertise}"
      - Years of Experience: ${expert.yearsExperience}
      - Bio snippet / existing info: "${expert.bio || 'Top professional consultant'}"

      Requirements:
      1. Write a 250 to 300 word engaging, authoritative bio highlighting their expertise, value proposition, and why clients should book them.
      2. Generate 4 structured key service offerings tailored to search queries (e.g. "Cloud Computing Interview Prep", "1-on-1 Resume & Portfolio Review"). Each with title and 2-sentence description.
      3. Generate 4 "Commonly Asked Questions" (FAQs) with detailed, high-value answers specific to their field (e.g. "How do I prepare for a Cloud Computing interview?", "What happens during a consultation session?").
      4. Generate a SEO Meta Title (under 60 chars, e.g. "Top ${expert.subjectExpertise} Consultant | ${expert.name}") and Meta Description (under 150 chars).

      Return strictly a JSON object without markdown formatting:
      {
        "metaTitle": "SEO Meta Title string",
        "metaDescription": "SEO Meta Description string",
        "seoBio": "250-300 word detailed SEO bio",
        "services": [
          { "title": "Service Name", "description": "Detailed description of service" }
        ],
        "faqs": [
          { "question": "Frequently asked question?", "answer": "Clear actionable answer." }
        ]
      }
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```/, '').replace(/```$/, '').trim();

    let seoData;
    try {
      seoData = JSON.parse(text);
    } catch (err) {
      console.warn("Failed to parse Gemini SEO response JSON, using fallback structure", err);
      seoData = {
        metaTitle: `${expert.name} - ${expert.subjectExpertise} Expert | ConsultNow`,
        metaDescription: `Book a 1-on-1 consultation session with ${expert.name}, specialized in ${expert.subjectExpertise} with ${expert.yearsExperience}+ years experience.`,
        seoBio: expert.bio || `${expert.name} is an experienced professional in ${expert.subjectExpertise} with over ${expert.yearsExperience} years of proven track record helping individuals and organizations achieve their goals through targeted consulting sessions on ConsultNow.`,
        services: [
          { title: "1-on-1 Strategy Session", description: `Personalized consulting tailored to your goals in ${expert.subjectExpertise}.` },
          { title: "Career & Skill Assessment", description: "Comprehensive audit and actionable roadmap for career advancement." }
        ],
        faqs: [
          { question: `How can ${expert.name} help me in ${expert.subjectExpertise}?`, answer: `With ${expert.yearsExperience}+ years of industry experience, ${expert.name} offers direct guidance, strategic advice, and actionable solutions.` },
          { question: "How do I book a session?", answer: "Choose an available time slot on the profile page, complete payment, and instant video meeting credentials will be generated." }
        ]
      };
    }

    // Generate unique slug
    const cleanName = expert.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const cleanSubject = expert.subjectExpertise.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slug = `${cleanName}-${cleanSubject}-${expert.id.slice(0, 5)}`;

    // Generate referral code if missing
    const referralCode = expert.referralCode || `REF-${expert.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4)}${Math.floor(1000 + Math.random() * 9000)}`;

    const updatedExpert = await prisma.expert.update({
      where: { id: expertId },
      data: {
        seoSlug: expert.seoSlug || slug,
        seoBio: seoData.seoBio,
        seoServices: JSON.stringify(seoData.services),
        seoFaqs: JSON.stringify(seoData.faqs),
        seoMetaTitle: seoData.metaTitle,
        seoMetaDescription: seoData.metaDescription,
        referralCode: referralCode
      }
    });

    return {
      expert: updatedExpert,
      seoProfile: {
        ...seoData,
        slug: updatedExpert.seoSlug,
        referralCode: updatedExpert.referralCode
      }
    };
  } catch (error) {
    console.error("generateSeoProfile failed:", error);
    throw error;
  }
};

/**
 * Generates an automated structured Meeting Synopsis & ConsultNow Evaluation Metrics report
 */
const generateMeetingSynopsis = async (bookingDetails, transcriptOrNotes = '') => {
  try {
    const model = getModel();
    const { guestName, expertName, bookingType, details, startTime } = bookingDetails || {};
    
    const prompt = `
      You are an expert AI meeting analyst for ConsultNow platform.
      Analyze the following consultation session details and generate a professional, structured Meeting Synopsis and Evaluation Metrics report.

      Session Information:
      - Guest/Client Name: ${guestName || 'Client'}
      - Expert Consultant Name: ${expertName || 'Consultant'}
      - Booking Type: ${bookingType || 'Consultation'}
      - Primary Subject / Problem Description: "${details || 'General Consultation'}"
      - Session Time: ${startTime ? new Date(startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Recent Session'}
      ${transcriptOrNotes ? `- Raw Meeting Transcript / Notes: "${transcriptOrNotes}"` : ''}

      Task:
      Generate a comprehensive HTML-formatted meeting synopsis report suitable for emailing to the consultant and storing for ConsultNow evaluation metrics.

      The output MUST be valid HTML tags (e.g. <h4>, <p>, <ul>, <li>, <div>) and MUST contain:
      1. <h4>1. Executive Summary & Core Objectives</h4>
      2. <h4>2. Key Discussion Points & Insights</h4>
      3. <h4>3. Expert Advice & Actionable Recommendations</h4>
      4. <h4>4. Next Steps & Follow-up Items</h4>
      5. <h4>5. ConsultNow Evaluation Metrics & Quality Score</h4> (Include metrics such as Session Effectiveness Score: e.g. 9.4/10, Communication Rating, Problem Resolution Index, and Evaluation Summary for ConsultNow quality metrics).

      Do NOT wrap the result in markdown code blocks like \`\`\`html. Return pure HTML content directly.
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```html\n?/, '').replace(/\n?```$/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return text;
  } catch (error) {
    console.error("generateMeetingSynopsis failed, returning fallback synopsis:", error.message);
    const { guestName, expertName, bookingType, details } = bookingDetails || {};
    return `
      <div style="font-family: sans-serif;">
        <h4>1. Executive Summary & Core Objectives</h4>
        <p>The 1-hour <strong>${bookingType || 'Consultation'}</strong> session between client <strong>${guestName || 'Client'}</strong> and consultant <strong>${expertName || 'Expert'}</strong> focused on addressing: "${details || 'Consultation Session'}".</p>
        
        <h4>2. Key Discussion Points & Insights</h4>
        <ul>
          <li>Evaluated the client's current background, initial problem statement, and primary requirements.</li>
          <li>Provided structured domain insights and reviewed best practices applicable to the scenario.</li>
        </ul>

        <h4>3. Expert Advice & Actionable Recommendations</h4>
        <ul>
          <li>Implement immediate recommended strategy and monitor progress over the coming weeks.</li>
          <li>Utilize ConsultNow resources and follow-up templates for ongoing progress tracking.</li>
        </ul>

        <h4>4. Next Steps & Follow-up Items</h4>
        <ul>
          <li>Client to execute recommended action items.</li>
          <li>Consultant available for follow-up review sessions via ConsultNow.</li>
        </ul>

        <h4>5. ConsultNow Evaluation Metrics & Quality Score</h4>
        <p><strong>Session Effectiveness Score:</strong> 9.5 / 10</p>
        <p><strong>Communication & Resolution Index:</strong> High Quality</p>
        <p><em>This synopsis has been archived by ConsultNow for ongoing expert evaluation and platform metrics.</em></p>
      </div>
    `;
  }
};

/**
 * Analyzes a client feedback statement to extract key descriptor words/phrases (word bubbles)
 */
const analyzeFeedbackStatement = async (comment) => {
  if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
    return ['Great Session', 'Recommended'];
  }

  try {
    const model = getModel();
    const prompt = `
      Analyze the following client feedback statement for an expert consultant:
      "${comment}"

      Task:
      Extract 3 to 6 key descriptor words or short phrases (1-2 words each) that summarize the key qualities, topics, or praise mentioned by the client (e.g. "Insightful", "Punctual", "Clear Guidance", "Great Listener", "Expert Advice", "Patient", "Highly Recommended").

      Return ONLY a JSON array of strings, with proper capital casing. Do NOT include markdown code fences or extra text.
      Example format: ["Insightful", "Clear Guidance", "Punctual", "Expert Advice"]
    `;

    const response = await generateWithRetry(model, prompt);
    let text = response.text().trim();
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').replace(/^```/, '').replace(/```$/, '').trim();

    const keywords = JSON.parse(text);
    if (Array.isArray(keywords) && keywords.length > 0) {
      return keywords.map(k => String(k).trim()).filter(Boolean).slice(0, 6);
    }
  } catch (error) {
    console.warn('[ConsultNow AI] Feedback analysis fallback triggered:', error.message);
  }

  // Fallback heuristic extraction if Gemini is unavailable or errors out
  const words = comment.replace(/[^\w\s]/gi, '').split(/\s+/);
  const stopWords = new Set(['the','and','a','to','of','in','i','is','that','for','it','as','was','with','on','are','this','be','have','from','at','or','by','an','my','so','very','much','good','great','session','service']);
  const filtered = words.filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
  const capitalized = [...new Set(filtered.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))];
  
  if (capitalized.length > 0) {
    return capitalized.slice(0, 5);
  }
  return ['Insightful', 'Helpful', 'Great Guidance'];
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
  recommendPricing,
  generateSeoProfile,
  generateMeetingSynopsis,
  analyzeFeedbackStatement
};