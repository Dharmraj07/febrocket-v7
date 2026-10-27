const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const config = require("../config");
const app = require("../app");
const documentLibraryService = require("../services/documentLibraryService");
const formMappingService = require("../services/formMappingService");
const {
  createFormSession,
  mapFormFields,
  recordFormFeedback,
  resolveFormField,
  validateRequest,
} = require("../controllers/formMappingController");
const { prepareMappingDocuments } = require("../services/formMappingPayload");
const formSessionStore = require("../services/formSessionStore");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const libraryId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439012";

function request(overrides = {}) {
  return {
    user: { id: userId },
    body: {
      libraryId,
      website: {
        url: "https://example.gov.in/application?token=private",
        title: "Application",
        language: "en-IN",
        country: "India",
      },
      fields: [{
        fieldId: "field-0",
        name: "applicant_name",
        label: "Applicant Name",
        type: "text",
        tagName: "input",
        role: "textbox",
        ariaLabel: "Applicant name",
        section: "Personal details",
        nearbyText: "Enter the name as shown on the identity document.",
      }],
      ...overrides,
    },
  };
}

test("validates the form mapping request without trusting a request-body user ID", () => {
  assert.equal(validateRequest(request({ userId: "another-user" }).body), null);
  assert.match(
    validateRequest({ ...request().body, website: { url: "javascript:alert(1)" } }),
    /website URL/u,
  );
  assert.match(
    validateRequest({ ...request().body, fields: [{ fieldId: "x", type: "text" }] }),
    /form field/u,
  );
});

test("creates owner-scoped sessions and stores explicit answers without storing form values in feedback", async () => {
  const library = { _id: libraryId, userId, name: "Profile", documents: [] };
  const restore = replace(
    documentLibraryService,
    "getUserLibrary",
    async () => library,
  );
  formSessionStore.clearForTests();
  try {
    const createResponse = response();
    await createFormSession({
      user: { id: userId },
      body: {
        libraryId,
        url: "https://example.gov.in/application?private=query",
        title: "Application",
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 201);
    const { sessionId } = createResponse.body;
    const authorizedRequest = {
      user: { id: userId },
      body: {
        libraryId,
        sessionId,
        url: "https://example.gov.in/application",
      },
    };

    const answerResponse = response();
    await resolveFormField({
      ...authorizedRequest,
      body: { ...authorizedRequest.body, fieldId: "preferred-name", value: "Alex" },
    }, answerResponse);
    assert.equal(answerResponse.statusCode, 200);

    const feedbackResponse = response();
    await recordFormFeedback({
      ...authorizedRequest,
      body: {
        ...authorizedRequest.body,
        results: [{ fieldId: "preferred-name", status: "filled" }],
      },
    }, feedbackResponse);
    assert.equal(feedbackResponse.statusCode, 200);

    const session = formSessionStore.getSession({
      sessionId,
      userId,
      libraryId,
      url: "https://example.gov.in/next-step",
    });
    assert.deepEqual(formSessionStore.getAnswers(session), { "preferred-name": "Alex" });
    assert.deepEqual(session.feedback.map(({ fieldId, status }) => [fieldId, status]), [
      ["preferred-name", "filled"],
    ]);
    assert.equal(session.feedback.some((item) => "value" in item), false);
  } finally {
    formSessionStore.clearForTests();
    restore();
  }
});

test("rejects cross-user, cross-library, and cross-origin form-session access", async () => {
  const sessionId = "test-session";
  formSessionStore.clearForTests();
  formSessionStore.createSession({
    sessionId,
    userId,
    libraryId,
    url: "https://example.gov.in/form",
  });
  try {
    for (const [requestUserId, body] of [
      ["507f1f77bcf86cd799439099", { sessionId, libraryId, url: "https://example.gov.in/form" }],
      [userId, { sessionId, libraryId: "507f1f77bcf86cd799439099", url: "https://example.gov.in/form" }],
      [userId, { sessionId, libraryId, url: "https://attacker.example/form" }],
    ]) {
      const res = response();
      await resolveFormField({
        user: { id: requestUserId },
        body: { ...body, fieldId: "field", value: "answer" },
      }, res);
      assert.equal(res.statusCode, 404);
    }
  } finally {
    formSessionStore.clearForTests();
  }
});

test("passes only session-resolved answers into the existing mapping endpoint", async () => {
  const library = { _id: libraryId, userId, name: "Profile", documents: [] };
  const sessionId = "map-session";
  let received;
  const restores = [
    replace(documentLibraryService, "getUserLibrary", async () => library),
    replace(formMappingService, "mapFormFields", async (payload) => {
      received = payload;
      return [];
    }),
  ];
  formSessionStore.clearForTests();
  formSessionStore.createSession({
    sessionId,
    userId,
    libraryId,
    url: "https://example.gov.in/form",
  });
  formSessionStore.resolveField({
    session: formSessionStore.getSession({ sessionId, userId, libraryId }),
    fieldId: "field-0",
    value: "User answer",
  });
  try {
    const res = response();
    await mapFormFields(request({ sessionId }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(received.userAnswers, { "field-0": "User answer" });
  } finally {
    formSessionStore.clearForTests();
    restores.reverse().forEach((restore) => restore());
  }
});

test("preserves extracted profile data for AI analysis while excluding raw OCR text", () => {
  const prepared = prepareMappingDocuments({
    name: "Dharm Raj Hembram",
    documents: [{
      documentId: "doc-1",
      documentType: "Identity document",
      fileType: "application/pdf",
      fileSize: 1000,
      data: {
        person: { fullName: "Dharm Raj Hembram", dateOfBirth: "2000-01-01" },
        document: { aadhaarNumber: "123456789012", panNumber: "ABCDE1234F" },
        rawText: "large private text",
      },
    }],
  });

  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].data.person.fullName, "Dharm Raj Hembram");
  assert.equal(prepared[0].data.person.dateOfBirth, "2000-01-01");
  assert.equal(prepared[0].data.document.aadhaarNumber, "123456789012");
  assert.equal(prepared[0].data.document.panNumber, "ABCDE1234F");
  assert.equal(prepared[0].data.rawText, undefined);
});

test("scopes multi-person extraction data to the selected library person", () => {
  const prepared = prepareMappingDocuments({
    name: "Dharm Raj Hembram",
    documents: [{
      documentId: "doc-2",
      documentType: "Joint record",
      fileType: "application/pdf",
      data: {
        person: {
          persons: [
            { fullName: "Dharm Raj Hembram" },
            { fullName: "Another Person" },
          ],
        },
      },
    }],
  }, [{ name: "applicant_name", label: "Applicant Name" }]);

  assert.deepEqual(prepared[0].data.person.persons, [
    { fullName: "Dharm Raj Hembram" },
  ]);
});

test("retains a single extracted person when the library has a custom name", () => {
  const prepared = prepareMappingDocuments({
    name: "My Aadhaar",
    documents: [{
      documentId: "doc-3",
      documentType: "Identity document",
      fileType: "application/pdf",
      data: {
        person: {
          persons: [{ fullName: "Dharm Raj Hembram" }],
        },
      },
    }],
  }, [{ name: "applicant_name", label: "Applicant Name" }]);

  assert.deepEqual(prepared[0].data.person.persons, [
    { fullName: "Dharm Raj Hembram" },
  ]);
});

test("does not discard profile values when website labels use different terminology", () => {
  const prepared = prepareMappingDocuments({
    name: "Dharm Raj Hembram",
    documents: [{
      documentId: "doc-4",
      documentType: "Application record",
      fileType: "application/pdf",
      data: {
        personalDetails: {
          maritalStatus: "Single",
          annualFamilyIncome: "120000",
        },
      },
    }],
  });

  assert.deepEqual(prepared[0].data.personalDetails, {
    maritalStatus: "Single",
    annualFamilyIncome: "120000",
  });
});

test("maps an owned library directly through Document-Service and returns suggestions", async () => {
  const library = {
    _id: libraryId,
    userId,
    name: "Dharm Raj Hembram",
    documents: [{
      documentId: "507f1f77bcf86cd799439013",
      documentType: "Identity document",
      fileType: "application/pdf",
      fileSize: 1024,
      data: { person: { fullName: "Dharm Raj Hembram" } },
    }],
  };
  let received;
  const restores = [
    replace(documentLibraryService, "getUserLibrary", async () => library),
    replace(formMappingService, "mapFormFields", async (payload) => {
      received = payload;
      return [{
        fieldId: "field-0",
        status: "mapped",
        value: "Dharm Raj Hembram",
        source: "documents[0].data.person.fullName",
        confidence: 0.99,
        requiresConfirmation: false,
      }];
    }),
  ];

  try {
    const res = response();
    await mapFormFields(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.libraryId, libraryId);
    assert.equal(res.body.fields[0].value, "Dharm Raj Hembram");
    assert.equal(received.personName, "Dharm Raj Hembram");
    assert.equal(received.fields[0].fieldId, "field-0");
    assert.equal(received.fields[0].role, "textbox");
    assert.equal(received.fields[0].section, "Personal details");
    assert.equal(received.fields[0].id, "");
    assert.deepEqual(received.website, {
      url: "https://example.gov.in",
      title: "Application",
      language: "en-IN",
      country: "India",
      currentStep: "",
      actions: [],
    });
    assert.equal(received.documents[0].data.person.fullName, "Dharm Raj Hembram");
    assert.equal(JSON.stringify(received).includes("private"), false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("rejects a library owned by a different user before running Gemini", async () => {
  const originalGetUserLibrary = documentLibraryService.getUserLibrary;
  const originalMap = formMappingService.mapFormFields;
  documentLibraryService.getUserLibrary = async () => null;
  formMappingService.mapFormFields = async () => {
    throw new Error("Should not call Gemini for a foreign library.");
  };

  try {
    const res = response();
    await mapFormFields(request(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
  } finally {
    documentLibraryService.getUserLibrary = originalGetUserLibrary;
    formMappingService.mapFormFields = originalMap;
  }
});

test("returns success with no fields when no website fields were detected", async () => {
  const originalGetUserLibrary = documentLibraryService.getUserLibrary;
  documentLibraryService.getUserLibrary = async () => ({
    _id: libraryId,
    userId,
    name: "Dharm",
    documents: [],
  });
  try {
    const res = response();
    await mapFormFields(request({ fields: [] }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.fields, []);
  } finally {
    documentLibraryService.getUserLibrary = originalGetUserLibrary;
  }
});

test("public form-mapping route uses existing JWT authentication and route mount", async () => {
  const server = app.listen(0);
  const originalGetUserLibrary = documentLibraryService.getUserLibrary;
  const originalMap = formMappingService.mapFormFields;
  const token = jwt.sign({ id: userId }, config.jwtAccessSecret);
  documentLibraryService.getUserLibrary = async () => ({
    _id: libraryId,
    userId,
    name: "Dharm",
    documents: [],
  });
  formMappingService.mapFormFields = async () => [];

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/forms/map`;
    const unauthenticated = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request().body),
    });
    assert.equal(unauthenticated.status, 401);

    const authenticated = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request({ fields: [] }).body),
    });
    assert.equal(authenticated.status, 200);
    assert.deepEqual((await authenticated.json()).fields, []);
  } finally {
    documentLibraryService.getUserLibrary = originalGetUserLibrary;
    formMappingService.mapFormFields = originalMap;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
