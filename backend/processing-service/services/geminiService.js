const { GoogleGenAI } = require("@google/genai");
const fs = require("fs/promises");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const { getEnvNumber } = require("../helpers/env");

// ============================================================
// GEMINI ROTATION CONFIGURATION
// ============================================================

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL_1 || "gemini-2.0-flash",
  process.env.GEMINI_MODEL_2 || "gemini-1.5-flash",
];

// Request counter
let geminiRequestCounter = 0;

/**
 * Get the next Gemini API key + model combination.
 */
const getNextGeminiConfig = () => {
  if (GEMINI_API_KEYS.length === 0) {
    return {
      apiKey: null,
      model: GEMINI_MODELS[0],
      keyIndex: 0,
      modelIndex: 1,
      requestNumber: 0,
    };
  }

  const requestNumber = geminiRequestCounter++;

  const keyIndex = requestNumber % GEMINI_API_KEYS.length;
  const modelIndex = requestNumber % GEMINI_MODELS.length;

  const apiKey = GEMINI_API_KEYS[keyIndex];
  const model = GEMINI_MODELS[modelIndex];

  return {
    apiKey,
    model,
    keyIndex: keyIndex + 1,
    modelIndex: modelIndex + 1,
    requestNumber: requestNumber + 1,
  };
};

const processingTimeoutMs = Math.max(
  1000,
  getEnvNumber("GEMINI_FILE_PROCESSING_TIMEOUT_MS", 120000)
);

function normalizeExtractionResult(extractedData) {
  if (
    !extractedData ||
    typeof extractedData !== "object" ||
    Array.isArray(extractedData)
  ) {
    throw new Error("Gemini returned a JSON value that is not an object.");
  }

  const person = extractedData.person;
  if (!person || typeof person !== "object" || Array.isArray(person)) {
    return {
      ...extractedData,
      person: { identificationStatus: "unavailable", persons: [] },
    };
  }

  const persons = Array.isArray(person.persons)
    ? person.persons
    : typeof person.fullName === "string"
      ? [{ fullName: person.fullName }]
      : [];
  const hasIdentifiedPerson = person.identificationStatus === "identified" &&
    persons.some((candidate) => {
      const fullName = typeof candidate === "string"
        ? candidate
        : candidate?.fullName;
      return typeof fullName === "string" && fullName.trim().length > 0;
    });

  return {
    ...extractedData,
    person: {
      ...person,
      identificationStatus: hasIdentifiedPerson ? "identified" : "unavailable",
      persons,
    },
  };
}

/**
 * Processes an in-memory file object using Gemini.
 *
 * @param {Object} multerFile - The req.file object from Express
 * @returns {Promise<Object>} - The extracted JSON data
 */
const processDocumentWithGemini = async (multerFile) => {
  // Select API key + model BEFORE any async operation.
  // This keeps each request's assigned combination stable.
  const {
    apiKey,
    model,
    keyIndex,
    modelIndex,
    requestNumber,
  } = getNextGeminiConfig();

  if (!apiKey) {
    throw new Error("No Gemini API key configured.");
  }

  // Create Gemini client for this specific request
  const ai = new GoogleGenAI({
    apiKey,
  });

  console.log(
    `[Gemini] Request #${requestNumber} -> Model ${modelIndex} + API Key ${keyIndex}`
  );

  let filePath = multerFile.path;
  let isTempFile = false;
  let geminiFile;

  // 1. If using Multer memoryStorage, create temporary file
  if (!filePath && multerFile.buffer) {
    const tempDir = os.tmpdir();

    const extension = path.extname(
      path.basename(multerFile.originalname || "")
    );

    filePath = path.join(
      tempDir,
      `${crypto.randomUUID()}${extension}`
    );

    await fs.writeFile(
      filePath,
      multerFile.buffer,
      {
        flag: "wx",
        mode: 0o600,
      }
    );

    isTempFile = true;
  }

  if (!filePath) {
    throw new Error(
      "No valid file path or buffer found in req.file"
    );
  }

  const processingStartedAt = Date.now();

  try {
    console.log("Uploading file to Gemini File API...");

    // 2. Upload file
    geminiFile = await ai.files.upload({
      file: filePath,
      mimeType: multerFile.mimetype,
    });

    // 3. Wait for Gemini to process the file
    while (geminiFile.state === "PROCESSING") {
      if (
        Date.now() - processingStartedAt >=
        processingTimeoutMs
      ) {
        throw new Error(
          "Timed out waiting for Gemini to process the document."
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      geminiFile = await ai.files.get({
        name: geminiFile.name,
      });
    }

    if (geminiFile.state === "FAILED") {
      throw new Error(
        "Gemini failed to process the document."
      );
    }

    console.log(
      `Extracting data using ${model}...`
    );

    // 4. Prompt
    const prompt = `
      You are an expert data extraction AI. 
      Analyze the provided document and extract ALL valuable and relevant information.
      
      Format your response strictly as a single JSON object. 
      
      Return one JSON object with this exact top-level structure:
      {
        "person": {
          "identificationStatus": "identified or unavailable",
          "persons": [
            { "fullName": "Exact full name explicitly supported by the document" }
          ]
        },
        "document": {
          "documentType": "A brief classification of the document",
          "...": "All other relevant information extracted from the document"
        }
      }
      
      Rules:
      - Use the document's visible contents as the only source of facts. Never use the uploaded filename to identify an owner.
      - Identify only people the document explicitly establishes as owners or subjects. Do not treat every person mentioned (such as an issuer, employer, witness, or official) as an owner.
      - If one or more owners/subjects are explicitly identifiable, set identificationStatus to "identified" and include every such person in persons.
      - If no owner/subject is explicitly identifiable, set identificationStatus to "unavailable" and persons to an empty array. Never invent or infer a person's identity.
      - Keep ownership separate from documentType. A document may have multiple persons or no identifiable person.
      - Put the document classification and all other extracted information inside document. Add clear camelCase keys for relevant fields not shown in the example; do not discard useful information to fit a predefined schema.
      - Preserve lists, tables, and repeated entries as arrays of objects where appropriate.
      - Do not create a person or owner named "Other"; unavailable ownership is represented by the empty persons array.
      - Return ONLY valid JSON.
      - Do not include markdown code blocks.
      - Do not include backticks.
      - Do not include conversational text.
      - Do NOT guess or hallucinate missing information.
    `;

    // 5. Generate structured JSON
    const response = await ai.models.generateContent({
      model,

      contents: [
        {
          role: "user",

          parts: [
            {
              fileData: {
                fileUri: geminiFile.uri,
                mimeType:
                  geminiFile.mimeType ||
                  multerFile.mimetype,
              },
            },

            {
              text: prompt,
            },
          ],
        },
      ],

      config: {
        responseMimeType: "application/json",
      },
    });

    // 6. Return parsed JSON with safe code fence removal
    let parsedResult;
    try {
      const cleaned = (response.text || "")
        .replace(/```(?:json)?\s*([\s\S]*?)\s*```/u, "$1")
        .trim();
      parsedResult = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Gemini response is not valid JSON:", response.text);
      throw new Error(`Failed to parse structured JSON from Gemini: ${parseError.message}`);
    }
    return normalizeExtractionResult(parsedResult);

  } finally {

    // Delete Gemini temporary file
    if (geminiFile?.name) {
      try {
        await ai.files.delete({
          name: geminiFile.name,
        });
      } catch (error) {
        console.error(
          "Failed to delete temporary Gemini file:",
          error.message
        );
      }
    }

    // Delete local temporary file
    if (isTempFile) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(
            "Failed to delete temporary document file:",
            error.message
          );
        }
      }
    }
  }
};

module.exports = {
  processDocumentWithGemini,
  normalizeExtractionResult,
};