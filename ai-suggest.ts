import { GoogleGenAI } from "@google/genai";

const MAX_NAME_LENGTH = 200;

export interface ShortcutSuggestion {
  category: string;
  tags: string[];
  description: string;
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function suggestShortcut(name: string): Promise<ShortcutSuggestion> {
  const cleanedName = name.trim();
  if (!cleanedName || cleanedName.length > MAX_NAME_LENGTH) {
    throw new Error("A valid program name is required.");
  }

  const prompt = `You are a utility cataloguing assistant. The program name is ${JSON.stringify(cleanedName)}.
Suggest:
1. One category or primary use-case group. Prefer: Gaming, Productivity, Creative, Development, Streaming & Video, Utilities, or Communication.
2. Three to five relevant lowercase search tags.
3. One concise sentence describing the program.

Return only JSON matching the supplied schema.`;

  const response = await getGeminiClient().models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          tags: { type: "ARRAY", items: { type: "STRING" } },
          description: { type: "STRING" },
        },
        required: ["category", "tags", "description"],
      },
    },
  });

  if (!response.text) throw new Error("The suggestion service returned no content.");
  return JSON.parse(response.text) as ShortcutSuggestion;
}
