import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import OpenAI from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import puppeteer from "puppeteer";
import "dotenv/config";

const {
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  OPENAI_API_KEY,
} = process.env;

type SimilarityMetric = "cosine" | "euclidean" | "dot_product";

interface PropertyData {
  price: string;
  address: string;
  description: string;
  features: string[];
  bedrooms: string;
  url: string;
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Initialize the client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, {
  namespace: ASTRA_DB_NAMESPACE!,
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const createCollection = async (
  similarityMetric: SimilarityMetric = "cosine"
) => {
  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION!, {
      vector: {
        dimension: 1536,
        metric: similarityMetric,
      },
    });
    console.log("Collection created successfully:", res);
  } catch (error) {
    if ((error as any).message?.includes("already exists")) {
      console.log("Collection already exists, continuing...");
    } else {
      throw error;
    }
  }
};

const scrapePropertyListings = async (
  pageNum: number = 1
): Promise<string[]> => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  const url = `https://www.zoopla.co.uk/for-sale/property/london/?page_size=25&page_number=${pageNum}`;

  await page.goto(url, { waitUntil: "networkidle0" });

  const propertyUrls = await page.evaluate(() => {
    const listings = document.querySelectorAll(
      'a[data-testid="listing-details-link"]'
    );
    return Array.from(listings).map((link) => link.getAttribute("href"));
  });

  await browser.close();
  return propertyUrls.filter((url): url is string => url !== null);
};

const scrapePropertyDetails = async (url: string): Promise<PropertyData> => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  await page.goto(`https://www.zoopla.co.uk${url}`, {
    waitUntil: "networkidle0",
  });

  const propertyData = await page.evaluate(() => {
    const price =
      document.querySelector('[data-testid="price"]')?.textContent || "";
    const address =
      document.querySelector('[data-testid="address-label"]')?.textContent ||
      "";
    const description =
      document.querySelector('[data-testid="listing_description"]')
        ?.textContent || "";
    const features = Array.from(
      document.querySelectorAll('[data-testid="features_list"] li')
    ).map((feature) => feature.textContent || "");
    const bedrooms =
      document.querySelector('[data-testid="beds-label"]')?.textContent || "";

    return {
      price,
      address,
      description,
      features,
      bedrooms,
      url,
    };
  });

  await browser.close();
  return propertyData;
};

const loadSampleData = async () => {
  const houses = await db.collection(ASTRA_DB_COLLECTION!);
  const propertyUrls = await scrapePropertyListings(1); // Start with page 1

  console.log(`Found ${propertyUrls.length} properties to process`);

  for (const url of propertyUrls) {
    try {
      console.log(`Processing property: ${url}`);
      const propertyData = await scrapePropertyDetails(url);

      const propertyText = `
        Price: ${propertyData.price}
        Address: ${propertyData.address}
        Bedrooms: ${propertyData.bedrooms}
        Description: ${propertyData.description}
        Features: ${propertyData.features.join(", ")}
        URL: ${propertyData.url}
      `;

      const chunks = await splitter.splitText(propertyText);

      for (const chunk of chunks) {
        const embedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunk,
          encoding_format: "float",
        });

        const vector = embedding.data[0].embedding;

        await houses.insertOne({
          vector: vector,
          text: chunk,
          property_url: url,
          full_data: propertyData,
        });

        console.log(`Stored chunk for property: ${url}`);
      }
    } catch (error) {
      console.error(`Error processing property ${url}:`, error);
      continue;
    }
  }
};

// Main execution
const run = async () => {
  try {
    await createCollection();
    await loadSampleData();
    console.log("Data loading completed successfully");
  } catch (error) {
    console.error("Error in main execution:", error);
  }
};

run();
