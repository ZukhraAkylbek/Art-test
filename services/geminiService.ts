import { GoogleGenAI, Type } from "@google/genai";
import { FeedbackItem, AIAnalysis, Department, Urgency, FeedbackType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeFeedback = async (message: string, currentUrgency: string): Promise<AIAnalysis> => {
  try {
    // Schema for structured output
    const schema = {
      type: Type.OBJECT,
      properties: {
        sentiment: { type: Type.STRING, enum: ['positive', 'neutral', 'negative'] },
        summary: { type: Type.STRING },
        suggestedAction: { type: Type.STRING },
        urgencyScore: { type: Type.INTEGER, description: "Rate urgency from 1 to 10 based on content" }
      },
      required: ['sentiment', 'summary', 'suggestedAction', 'urgencyScore']
    };

    const prompt = `
      Analyze the following feedback message submitted to the Artwin corporate platform.
      User declared urgency: ${currentUrgency}.
      
      Message: "${message}"
      
      Provide a brief summary, suggest an immediate action for the administrator, assess sentiment, and rate the actual urgency based on the content (1-10).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        systemInstruction: "You are an expert HR and Operations assistant for Artwin. Be concise and professional."
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIAnalysis;
    }
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      sentiment: 'neutral',
      summary: 'AI Analysis unavailable',
      suggestedAction: 'Review manually',
      urgencyScore: 5
    };
  }
};

export const suggestDepartment = async (message: string): Promise<Department> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Classify the following corporate feedback into one of these exact categories: HR, Стройка, Финансы, Снабжение, Прочее. Return ONLY the category name. Message: "${message}"`
        });
        
        const text = response.text?.trim();
        if (text && Object.values(Department).includes(text as Department)) {
            return text as Department;
        }
        return Department.OTHER;
    } catch (e) {
        return Department.OTHER;
    }
}

export const draftResponse = async (feedback: FeedbackItem): Promise<string> => {
    try {
        const prompt = `
            Draft a polite, professional response to this ${feedback.type} from a ${feedback.role}.
            Context: The user wrote: "${feedback.message}".
            The current status is ${feedback.status}.
            
            If it's a complaint, be empathetic and assure them it's being looked at.
            If it's a proposal, thank them for their initiative.
            Keep it under 100 words.
            Sign off as "Команда Artwin".
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Using Pro for better writing quality
            contents: prompt
        });

        return response.text || "Could not generate draft.";
    } catch (e) {
        return "Service unavailable.";
    }
}

export const generateManagementReport = async (items: FeedbackItem[], department: Department): Promise<string> => {
    try {
        if (items.length === 0) return "No data available to generate a report.";

        const complaints = items.filter(i => i.type === FeedbackType.COMPLAINT).length;
        const proposals = items.filter(i => i.type === FeedbackType.PROPOSAL).length;
        const urgent = items.filter(i => i.urgency === Urgency.URGENT).length;
        const recentMessages = items.slice(0, 5).map(i => `- [${i.type}] ${i.message}`).join('\n');

        const prompt = `
            You are a Data-Driven Consultant for Artwin's ${department} department.
            
            Here is the current data:
            - Total Feedback Items: ${items.length}
            - Complaints: ${complaints}
            - Proposals: ${proposals}
            - Urgent Items: ${urgent}
            
            Recent feedback samples:
            ${recentMessages}

            Write a short Executive Report for the Manager.
            1. Summarize the mood (Sentiment).
            2. Highlight the key problem area based on the samples.
            3. Provide 3 bullet points on "What to Improve" (Strategic Advice).
            
            Format with bold headers. Keep it suitable for a Telegram message (concise).
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt
        });

        return response.text || "Analysis complete.";
    } catch (e) {
        return "Report generation failed.";
    }
};