"use client";

import { useState } from "react";
import { Send, Plus, Hash, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
};

export default function ChatApp() {
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChannel, setCurrentChannel] = useState("general");

  const channels = ["general", "random", "ideas", "questions"];

  const handleSendMessage = async (content: string) => {
    try {
      setIsTyping(true);

      const response = await fetch("/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messages.map(({ content, role }) => ({ content, role })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: data.text,
        role: "assistant",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: input,
      role: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    await handleSendMessage(input);
  };

  return (
    <div className="flex h-screen bg-[#36393f] text-gray-100">
      {/* Sidebar */}
      <div className="w-60 bg-[#2f3136] flex flex-col">
        <div className="p-4 shadow-md">
          <h1 className="text-xl font-bold">ModernChat</h1>
        </div>
        <ScrollArea className="flex-grow">
          <div className="p-2 space-y-2">
            {channels.map((channel) => (
              <Button
                key={channel}
                variant="ghost"
                className={cn(
                  "w-full justify-start text-gray-300 hover:text-white hover:bg-[#42464D]",
                  currentChannel === channel && "bg-[#42464D] text-white"
                )}
                onClick={() => setCurrentChannel(channel)}
              >
                <Hash className="h-5 w-5 mr-2" />
                {channel}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="p-4 shadow-md bg-[#36393f] flex justify-between items-center">
          <div className="flex items-center">
            <Hash className="h-6 w-6 mr-2 text-gray-400" />
            <h2 className="text-lg font-semibold">{currentChannel}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-grow p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-start space-x-3 p-2 rounded-lg",
                  message.role === "user" ? "bg-[#40444b]" : "bg-[#32353b]"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  {message.role === "user" ? "U" : "A"}
                </div>
                <div className="flex-1">
                  <p className="font-medium">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="text-gray-300">{message.content}</p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="text-gray-400 italic">Assistant is typing...</div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <footer className="p-4 bg-[#40444b]">
          <form onSubmit={onSubmit} className="flex items-center space-x-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message #${currentChannel}`}
              className="flex-grow bg-[#40444b] border-none text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
            />
            <Button
              type="submit"
              size="icon"
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
              disabled={isTyping || !input.trim()}
            >
              <Send className="h-5 w-5" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </footer>
      </div>
    </div>
  );
}
