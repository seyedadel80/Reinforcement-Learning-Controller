import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure Gemini agent initialization
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not defined. AI Tutor features will be unavailable.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: AI RL Assistant/Tutor
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (!ai) {
        return res.json({
          reply: "سلام! کلید API برای جمینای ثبت نشده است. برای استفاده از مربی هوش مصنوعی، لطفاً GEMINI_API_KEY را در بخش تنظیمات وارد کنید. اما نگران نباشید، کار با شبیه‌ساز فیزیک و یادگیری تقویتی در مرورگر شما به صورت کاملاً آفلاین و محلی فعال است! 😊"
        });
      }

      const systemInstruction = `You are an expert Professor of Artificial Intelligence and Control Systems Engineering specializing in Reinforcement Learning (RL). 
The user is interacting with a web-based real-time Reinforcement Learning control simulator for an Inverted Pendulum and Cart-Pole system.
The user's native language is Persian (Farsi), so write your response primarily in beautiful, helpful, and technically accurate Persian. Use English technical terms where appropriate (e.g., policy, state, transfer function, PID, Q-learning, exploration vs exploitation, reward function) alongside Persian equivalents.
Provide highly practical explanations. Avoid empty generalities and write clean equations (using readable notation, no raw complex LaTeX block if it renders poorly, or use clean Unicode formatting) if necessary.
Explain concepts like:
- Q-learning: Q(s,a) = Q(s,a) + alpha * [Reward + gamma * max Q(s',a') - Q(s,a)]
- PID control: u(t) = Kp*e(t) + Ki*integral(e) + Kd*derivative(e)
- State Representation (discretization, binning)
- Reward shaping (e.g., why -theta^2 -0.1*theta_dot^2 works better than sparse reward of +1).
Keep the answers medium-length, encouraging, and highly technical yet understandable.
Current system state environment information for your reference: ${JSON.stringify(context || {})}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: message,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      const reply = response.text || "پاسخی دریافت نشد.";
      res.json({ reply });

    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ 
        error: "Failed to communicate with Gemini", 
        details: error.message,
        reply: "متأسفانه در اتصال به سرور مربی هوش مصنوعی جمینای خطایی رخ داد. لطفاً چند لحظه دیگر امتحان کنید."
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start fullstack server:", err);
});
