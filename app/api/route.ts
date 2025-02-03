import { ChatOpenAI } from "@langchain/openai";
import {
  START,
  END,
  MessagesAnnotation,
  StateGraph,
  MemorySaver,
} from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { trimMessages } from "@langchain/core/messages";

export const dynamic = "force-static";

// General template when sending messages to the LLM.
const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a professional house buying assistant, you know everything about buying houses and you are able to reccomend the perfect house for the user based on their needs and preferences.",
  ],
  ["placeholder", "{messages}"],
]);

// Changing this will change the history of the chat, this is used to keep a track of the current chat.
const config = { configurable: { thread_id: uuidv4() } };

// This function makes sure that we do not go over the LLM context window when parsing previous messages, so it will remember only the recent prompts not every single one.
const trimmer = trimMessages({
  maxTokens: 10,
  strategy: "last",
  tokenCounter: (msgs) => msgs.length,
  includeSystem: true,
  allowPartial: false,
  startOn: "human",
});

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
});

// This function is used to call the LLM and get the response.
const callModel = async (state: typeof MessagesAnnotation.State) => {
  const trimmedMessage = await trimmer.invoke(state.messages);
  const prompt = await promptTemplate.invoke({
    messages: trimmedMessage,
  });
  const response = await llm.invoke(prompt);
  return { messages: [response] };
};

// TODO: Understand this
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  .addEdge(START, "model")
  .addEdge("model", END);

const memory = new MemorySaver();
const app = workflow.compile({ checkpointer: memory });

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const input = [
      {
        role: "user",
        content: message,
      },
    ];

    const output = await app.invoke({ messages: input }, config);

    console.log(output);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
