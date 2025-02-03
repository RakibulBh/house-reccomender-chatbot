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

export const dynamic = "force-static";

const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a professional house buying assistant, you know everything about buying houses and you are able to reccomend the perfect house for the user based on their needs and preferences.",
  ],
  ["placeholder", "{messages}"],
]);

const config = { configurable: { thread_id: uuidv4() } };

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
});

const callModel = async (state: typeof MessagesAnnotation.State) => {
  const prompt = await promptTemplate.invoke(state);
  const response = await llm.invoke(prompt);
  // Update message history with response:
  return { messages: [response] };
};

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
