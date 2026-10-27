const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const config = require("../config");
const app = require("../app");
const documentLibraryService = require("../services/documentLibraryService");
const formMappingService = require("../services/formMappingService");
const formSessionStore = require("../services/formSessionStore");

const mockUserId = "507f1f77bcf86cd799439012";
const mockLibraryId = "507f1f77bcf86cd799439011";

function createMockLibrary() {
  return {
    _id: mockLibraryId,
    userId: mockUserId,
    name: "John Doe",
    normalizedName: "john doe",
    documents: [
      {
        _id: crypto.randomUUID(),
        userId: mockUserId,
        documentId: crypto.randomUUID(),
        documentType: "aadhar",
        fileType: "pdf",
        displayName: "Aadhaar",
        fileName: "aadhar.pdf",
        extractedData: {
          name: "John Doe",
          dateOfBirth: "1990-05-15",
          gender: "Male",
          address: {
            street: "123 Main St",
            city: "Bangalore",
            state: "Karnataka",
            postalCode: "560001",
            country: "India",
          },
        },
        confidence: 0.95,
      },
      {
        _id: crypto.randomUUID(),
        userId: mockUserId,
        documentId: crypto.randomUUID(),
        documentType: "pan",
        fileType: "pdf",
        displayName: "PAN Card",
        fileName: "pan.pdf",
        extractedData: {
          name: "John Doe",
          panNumber: "AAABCD1234E",
        },
        confidence: 0.98,
      },
      {
        _id: crypto.randomUUID(),
        userId: mockUserId,
        documentId: crypto.randomUUID(),
        documentType: "marksheet",
        fileType: "pdf",
        displayName: "10th Marksheet",
        fileName: "marksheet.pdf",
        extractedData: {
          name: "John Doe",
          rollNumber: "12345",
          board: "CBSE",
          passingYear: 2008,
          marks: 450,
          totalMarks: 500,
        },
        confidence: 0.92,
      },
    ],
  };
}

async function makeRequest(baseUrl, method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, body: data };
}

test("E2E: Complete form-filling workflow", async (t) => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: mockUserId }, config.jwtAccessSecret);

  const originalGetUserLibrary = documentLibraryService.getUserLibrary;
  const originalMapFormFields = formMappingService.mapFormFields;
  let sessionId;

  documentLibraryService.getUserLibrary = async ({ libraryId, userId }) => {
    const library = createMockLibrary();
    return String(library._id) === String(libraryId) &&
      String(library.userId) === String(userId)
      ? library
      : null;
  };

  formSessionStore.clearForTests?.();

  try {
    // Test 1: Create form session
    await t.test("create a form session with valid library and URL", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/session", {
        libraryId: mockLibraryId,
        url: "https://example.gov.in/application",
        title: "Government Application",
      }, token);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, "created");
      assert(res.body.sessionId, "Session ID should be returned");
      sessionId = res.body.sessionId;
    });

    // Test 2: Analyze form fields
    await t.test("analyze form fields and extract semantic meanings", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/analyze", {
        libraryId: mockLibraryId,
        sessionId,
        url: "https://example.gov.in/application",
        fields: [
          {
            fieldId: "field-name",
            name: "applicant_name",
            label: "Applicant Name",
            type: "text",
            required: true,
          },
          {
            fieldId: "field-dob",
            name: "date_of_birth",
            label: "Date of Birth",
            type: "date",
            required: true,
          },
          {
            fieldId: "field-gender",
            name: "gender",
            label: "Gender",
            type: "select",
            options: ["Male", "Female", "Other"],
            required: false,
          },
        ],
      }, token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert(Array.isArray(res.body.fields), "Fields should be returned");
      assert.equal(res.body.fields.length, 3);
      assert(res.body.fields[0].semanticKey, "Semantic key should be identified");
    });

    // Test 3: Get form context
    await t.test("retrieve relevant person data for form fields", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/context", {
        libraryId: mockLibraryId,
        sessionId,
        url: "https://example.gov.in/application",
        fields: [
          {
            fieldId: "field-name",
            name: "applicant_name",
            label: "Applicant Name",
            type: "text",
          },
          {
            fieldId: "field-dob",
            name: "date_of_birth",
            label: "Date of Birth",
            type: "date",
          },
        ],
      }, token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert(Array.isArray(res.body.fields), "Fields should be returned");
    });

    // Test 4: Map form fields with real Gemini or mocked service
    await t.test("map form fields with decision engine", async () => {
      formMappingService.mapFormFields = async () => [
        {
          fieldId: "name",
          status: "mapped",
          value: "John Doe",
          decision: "fill",
          confidence: 0.95,
          evidence: [{ source: "aadhar", field: "name" }],
        },
        {
          fieldId: "dob",
          status: "mapped",
          value: "1990-05-15",
          decision: "fill",
          confidence: 0.92,
          evidence: [{ source: "aadhar", field: "dateOfBirth" }],
        },
      ];

      const res = await makeRequest(baseUrl, "POST", "/api/forms/map", {
        libraryId: mockLibraryId,
        website: {
          url: "https://example.gov.in/application",
          title: "Government Application",
          language: "en-IN",
          country: "India",
        },
        fields: [
          {
            fieldId: "name",
            label: "Full Name",
            type: "text",
            required: true,
          },
          {
            fieldId: "dob",
            label: "Date of Birth",
            type: "date",
            required: true,
          },
          {
            fieldId: "password",
            label: "Create Password",
            type: "password",
            required: true,
          },
        ],
      }, token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert(Array.isArray(res.body.fields));
      assert(res.body.fields.length > 0);
    });

    // Test 5: Resolve ambiguous field
    await t.test("resolve form field with user answer", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/resolve", {
        libraryId: mockLibraryId,
        sessionId,
        url: "https://example.gov.in/application",
        fieldId: "category-field",
        value: "General",
      }, token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, "resolved");
    });

    // Test 6: Record feedback
    await t.test("record form filling feedback", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/feedback", {
        libraryId: mockLibraryId,
        sessionId,
        url: "https://example.gov.in/application",
        results: [
          { fieldId: "field-1", status: "filled" },
          { fieldId: "field-2", status: "user_corrected" },
          { fieldId: "field-3", status: "skipped" },
        ],
      }, token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.received, 3);
    });

    // Test 7: Reject unauthenticated requests
    await t.test("reject requests without authentication", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/map", {
        libraryId: mockLibraryId,
        website: { url: "https://example.com" },
        fields: [],
      }, null);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    // Test 8: Reject invalid input
    await t.test("reject invalid form data", async () => {
      const res = await makeRequest(baseUrl, "POST", "/api/forms/map", {
        libraryId: mockLibraryId,
        website: { url: "not-a-url" },
        fields: [],
      }, token);

      assert(res.status >= 400, "Should reject invalid URL");
    });

  } finally {
    documentLibraryService.getUserLibrary = originalGetUserLibrary;
    formMappingService.mapFormFields = originalMapFormFields;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
