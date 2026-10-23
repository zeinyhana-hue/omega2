
import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.static("."));

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

app.get("/api/token", async (req, res) => {
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(
          Date.now() + 60 * 1000
        ).toISOString(),
        liveConnectConstraints: {
          model: "gemini-2.5-flash-native-audio-preview-12-2025",
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: `
You are OMEGA, a warm and friendly companion for children and older adults.

Speak in natural, simple Egyptian Arabic.
Be patient, gentle, and encouraging.
Ask one question at a time.
Help users recall meaningful people, places, and events through friendly conversation.
Never pressure users if they cannot remember.
Never invent personal memories.
For this prototype, use only the sample memories provided in the conversation.
            `,
          },
        },
      },
    });

    res.json({ token: token.name });
  } catch (error) {
    console.error("Token creation failed:", error.message);
    res.status(500).json({
      error: "Could not create a Gemini session. Check the server terminal.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`OMEGA is running at http://localhost:${PORT}`);
});

