const axios = require("axios");

const invokeUrl =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

// ======================================================
// PROCESS ANY DOCUMENT AND EXTRACT REUSABLE JSON DATA
// ======================================================

const processDocumentWithOCR = async (file) => {
  try {
    // Validate uploaded file
    if (!file?.buffer) {
      throw new Error("Invalid uploaded file.");
    }

    // Convert uploaded file to Base64
    const fileBase64 = file.buffer.toString("base64");

    // Universal prompt for different document types - simplified for better JSON response
    const prompt = `Analyze this uploaded document carefully. Extract all visible information and return ONLY valid JSON.

Use this exact JSON structure:
{
  "documentType": "unknown",
  "fields": {
    "fullName": null,
    "dateOfBirth": null,
    "gender": null,
    "fatherName": null,
    "motherName": null,
    "address": null,
    "phone": null,
    "email": null
  },
  "documentSpecificData": {}
}

Rules:
1. Identify the document type (Aadhaar, PAN, Passport, Driving License, Certificate, Resume, etc.)
2. Extract personal information into "fields"
3. Put ALL document-specific information (numbers, IDs, institutions, marks, etc.) in "documentSpecificData"
4. Only extract clearly visible information
5. Use null for missing information
6. Convert dates to YYYY-MM-DD format

Return ONLY valid JSON. No markdown, no code blocks, no explanations.`;

    // NVIDIA API request
    const payload = {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            file.sourceUrl
              ? {
                  type: "image_url",
                  image_url: { url: file.sourceUrl },
                }
              : {
                  type: "image_url",
                  image_url: {
                    url: `data:${file.mimetype};base64,${fileBase64}`,
                  },
                },
          ],
        },
      ],
      max_tokens: 4096,
      reasoning_budget: 4096,
      stream: false,
      temperature: 0.1,
      top_p: 0.95,
    };

    // Check for API key
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error("NVIDIA_API_KEY environment variable is not set");
    }

    // Call NVIDIA AI
    const response = await axios.post(
      invokeUrl,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 60000, // Increased timeout for larger documents
      }
    );

    // Get AI response content
    const content = response.data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No structured data received from NVIDIA AI.");
    }

    console.log("Raw AI Response:", content); // Debug log

    // Enhanced JSON extraction
    let jsonString = content;
    
    // Remove markdown code blocks
    jsonString = jsonString.replace(/```json\s*/gi, "");
    jsonString = jsonString.replace(/```\s*/g, "");
    
    // Remove any text before the first { and after the last }
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("No JSON object found in AI response");
    }
    
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    
    // Clean up common JSON issues
    jsonString = jsonString
      .replace(/,(\s*})/g, '$1') // Remove trailing commas
      .replace(/,(\s*])/g, '$1') // Remove trailing commas in arrays
      .trim();

    console.log("Cleaned JSON:", jsonString); // Debug log

    // Parse JSON with error handling
    let extractedData;
    try {
      extractedData = JSON.parse(jsonString);
    } catch (parseError) {
      // If parsing fails, try to fix common issues
      console.error("Initial JSON parse failed:", parseError.message);
      
      // Attempt to fix by removing control characters
      const cleaned = jsonString.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      
      try {
        extractedData = JSON.parse(cleaned);
      } catch (secondError) {
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
    }

    // Validate the structure
    if (!extractedData.documentType || !extractedData.fields) {
      // If structure is invalid, create a default structure
      extractedData = {
        documentType: extractedData.documentType || "unknown",
        fields: {
          fullName: extractedData.fields?.fullName || null,
          dateOfBirth: extractedData.fields?.dateOfBirth || null,
          gender: extractedData.fields?.gender || null,
          fatherName: extractedData.fields?.fatherName || null,
          motherName: extractedData.fields?.motherName || null,
          address: extractedData.fields?.address || null,
          phone: extractedData.fields?.phone || null,
          email: extractedData.fields?.email || null,
        },
        documentSpecificData: extractedData.documentSpecificData || {},
      };
    }

    // Ensure documentSpecificData is always an object
    if (!extractedData.documentSpecificData || typeof extractedData.documentSpecificData !== 'object') {
      extractedData.documentSpecificData = {};
    }

    // Return clean reusable JSON
    return extractedData;

  } catch (error) {
    console.error("❌ NVIDIA Document AI Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Throw a more specific error
    if (error.response?.status === 401) {
      throw new Error("Invalid NVIDIA API key. Please check your credentials.");
    } else if (error.response?.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    } else if (error.code === 'ECONNABORTED') {
      throw new Error("Request timeout. The document might be too large.");
    } else if (error.message.includes("JSON")) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    } else {
      throw new Error(
        `Failed to process document with NVIDIA AI: ${error.message}`
      );
    }
  }
};

// Alternative function with stricter JSON extraction using regex
const extractJSONFromText = (text) => {
  // Try to find JSON in the text using multiple patterns
  const patterns = [
    /\{[\s\S]*\}/, // Standard JSON object
    /```json\s*([\s\S]*?)\s*```/, // Markdown code block with json
    /```\s*([\s\S]*?)\s*```/, // Generic markdown code block
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let jsonStr = match[1] || match[0];
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
};

module.exports = {
  processDocumentWithOCR,
  extractJSONFromText,
};