import { DataAPIClient } from "@datastax/astra-db-ts";
import { OpenAI } from "openai";
import { generateId, createDataStreamResponse, streamText } from "ai";

const {
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
} = process.env;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(process.env.ASTRA_DB_API_ENDPOINT!, {
  namespace: process.env.ASTRA_DB_NAMESPACE!,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content;

    let docContext = "";

    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: lastMessage,
      encoding_format: "float",
    });

    try {
      const collection = await db.collection(ASTRA_DB_COLLECTION!);
      const cursor = await collection.find(
        {},
        {
          sort: {
            $vector: embedding.data[0].embedding,
          },
          limit: 2,
        }
      );

      const documents = await cursor.toArray();
      const docsMap = documents.map((doc) => doc.text).join("\n");
      docContext = JSON.stringify(docsMap);
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }

    console.log(docContext);

    const template = {
      role: "system",
      content: `
      You are a real estate agent who knows everything about the property market in London.
      You are given a question and a list of properties.
      Your job is to answer the question based on the provided properties. Please only answer the question based on the properties that have been given to you, if an answer is not given to you, please say so and return an appropriate message.
      Question: ${lastMessage}
      Properties: ${docContext}
      `,
    };

    const completion = await openai.chat.completions.create({
      stream: false,
      model: "gpt-4",
      messages: [template, ...messages],
    });

    return Response.json({
      text: completion.choices[0].message.content,
    });
  } catch (error) {
    console.log(error);
    return new Response(error, { status: 500 });
  }
}
