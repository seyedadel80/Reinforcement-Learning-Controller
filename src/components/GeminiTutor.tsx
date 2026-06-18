import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Sparkles, Cpu, BookOpen, Clock, AlertCircle } from "lucide-react";
import { EnvType, RLParams, PIDParams } from "../types";

interface Message {
  id: string;
  sender: "user" | "ai" | "system";
  text: string;
  timestamp: Date;
}

interface GeminiTutorProps {
  envType: EnvType;
  rlParams: RLParams;
  pidParams: PIDParams;
  stabilizationSteps: number;
}

export const GeminiTutor: React.FC<GeminiTutorProps> = ({
  envType,
  rlParams,
  pidParams,
  stabilizationSteps,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "Hello! I am your Neural Dynamics Assistant, specializing in reinforcement learning and control systems. 🎓\n\nToday, you are operating an inverted pendulum on a cart (Cart-Pole) and a Double Pendulum physics simulation. Feel free to explore how tabular reinforcement learning (Q-Learning and SARSA) discovers balancing strategies from scratch, comparing it with classical math-driven feedback controllers like PID.\n\nAsk me anything! Let's explore together.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Suggested quick prompts in English for learning
  const quickPrompts = [
    { label: "💡 RL Concepts", query: "Can you provide a simple and elegant summary of what Reinforcement Learning is and its real-world use cases?" },
    { label: "📐 Bellman Equation", query: "Explain the Bellman Equation used in Q-Learning. What do α (learning rate) and γ (discount factor) represent?" },
    { label: "🏹 Reward Shaping", query: "Why is non-linear Reward Shaping (like a quadratic angle penalty) much more effective for training agents than simple sparse binary rewards?" },
    { label: "⚖️ RL vs PID Controllers", query: "How does model-free Reinforcement Learning compare with model-driven classical PID controllers? List the pros and cons of each." },
  ];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    if (!customText) {
      setInput("");
    }

    const newUserMessage: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setLoading(true);

    // Prepare active environmental context to make Gemini incredibly smart & context-aware!
    const context = {
      envType,
      algorithm: rlParams.algorithm,
      learningRate: rlParams.learningRate,
      discountFactor: rlParams.discountFactor,
      epsilon: rlParams.epsilon,
      rewardType: rlParams.rewardType,
      pidEnabled: pidParams.enabled,
      pidKp: pidParams.Kp,
      pidKi: pidParams.Ki,
      pidKd: pidParams.Kd,
      stabilizationSteps,
    };

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend, context }),
      });

      const data = await response.json();
      
      const aiReply = data.reply || "An empty response was received.";

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "ai",
          text: aiReply,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error("Failed to query tutor:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "system",
          text: "A connection error occurred while contacting the AI dynamic assistant. Please confirm your API configuration variables.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0a0c12] border border-slate-800 rounded-lg shadow-2xl flex-1 flex flex-col overflow-hidden font-sans min-h-[660px]">
      
      {/* HEADER BAR */}
      <div className="p-4 border-b border-slate-800 bg-[#0a0c12] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5 leading-snug">
              <span>Neural Dynamics Advisor (Gemini 3.5 Flash)</span>
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            </h3>
            <span className="text-[9px] uppercase tracking-widest text-sky-400 flex items-center gap-1 mt-0.5 font-mono">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-ping mr-1" />
              Dynamic Advisory Engine
            </span>
          </div>
        </div>
      </div>

      {/* CHAT MESSAGES PANEL */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[500px] max-h-[640px] bg-[#050608]/70">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-start" : msg.sender === "ai" ? "items-end" : "items-center"
            }`}
          >
            <div
              className={`max-w-[85%] text-xs p-3 rounded-lg leading-relaxed whitespace-pre-wrap ${
                msg.sender === "user"
                  ? "bg-slate-950 text-sky-400 border border-sky-500/20 rounded-tl-none font-sans"
                  : msg.sender === "ai"
                    ? "bg-[#0c101a] text-slate-300 border border-sky-500/10 rounded-tr-none font-sans text-left shadow-xl"
                    : "bg-rose-500/10 text-rose-400 text-[9px] uppercase font-mono tracking-widest px-2.5 py-1 rounded"
              }`}
              style={{ direction: "ltr" }}
            >
              {msg.text}
              <div
                className={`text-[8px] mt-2 flex items-center gap-1 font-mono ${
                  msg.sender === "user" ? "text-sky-550" : "text-slate-500"
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                <span>
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {msg.sender === "ai" && (
                  <span className="text-sky-400 uppercase tracking-widest ml-2 font-mono">
                    [ ADVISOR ]
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#0c101a] border border-sky-550/15 p-3 rounded-lg rounded-tr-none">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-sky-450 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-sky-450 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-sky-450 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* QUICK SUGGESTIONS CARDS */}
      <div className="p-3 bg-[#0a0c12] border-t border-slate-800/60">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 text-left">SUGGESTED STUDY MODULES:</span>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x" style={{ direction: "ltr" }}>
          {quickPrompts.map((p, idx) => (
            <button
               key={idx}
               onClick={() => handleSendMessage(p.query)}
               disabled={loading}
               className="snap-start shrink-0 text-[10px] bg-slate-950 text-slate-400 border border-slate-850 hover:border-sky-450/40 hover:text-sky-400 p-1.5 px-3 rounded transition-all cursor-pointer font-sans"
            >
               {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* INPUT CONTROLLER FORM */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 border-t border-slate-800 bg-[#0a0c12] flex gap-2 items-center"
      >
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-45 cursor-pointer transition-all flex items-center justify-center shrink-0 border border-sky-500/20 uppercase font-mono h-10 w-10"
        >
          <Send className="w-4 h-4 text-[#050608]" />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about reinforcement learning, parameters, stability, or dynamics..."
          className="flex-1 border bg-slate-950 border-slate-850 text-slate-200 placeholder-slate-600 px-3.5 py-2.5 text-xs text-left font-sans focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded h-10"
        />
      </form>
    </div>
  );
};
