const test = require("node:test");
const assert = require("node:assert/strict");
const geminiFormMappingService = require("../services/geminiFormMappingService");
const { mapFormFields, getAtPath, valueMatchesSource } = require("../services/formMappingService");
const { extractCanonicalFacts, relevantFactsForField } = require("../services/personFacts");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

const document = {
  documentType: "Identity document",
  fileType: "application/pdf",
  data: {
    person: {
      persons: [{ fullName: "Dharm Raj Hembram" }],
      dateOfBirth: "2000-01-01",
      gender: "Male",
    },
  },
};

function mapping(field, overrides = {}) {
  return {
    fieldId: field.fieldId,
    status: "mapped",
    source: "documents[0].data.person.persons[0].fullName",
    value: "Dharm Raj Hembram",
    confidence: 0.99,
    reason: "The source matches the requested field.",
    ...overrides,
  };
}

test("maps only relevant person facts that match a provided source", async () => {
  const field = {
    fieldId: "field-0",
    label: "Applicant Name",
    type: "text",
    options: [],
  };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async ({ fields, facts }) => {
    assert.equal(fields.length, 1);
    assert.equal(fields[0].fieldId, field.fieldId);
    assert.equal(fields[0].label, field.label);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].fieldId, field.fieldId);
    assert.equal(facts[0].concept, "fullName");
    assert.equal(facts[0].value, "Dharm Raj Hembram");
    return { fields: [mapping(field)] };
  });

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.value, "Dharm Raj Hembram");
    assert.equal(result.status, "mapped");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.provenance.documentType, "Identity document");
  } finally {
    restore();
  }
});

test("analyzes complete selected-person data against the website field descriptors", async () => {
  const field = {
    fieldId: "marital-status",
    name: "applicant_status",
    label: "Current marital category",
    placeholder: "Choose your status",
    autocomplete: "",
    type: "select",
    options: ["Single", "Married"],
    required: true,
  };
  const profileDocuments = [{
    documentType: "Application record",
    fileType: "application/pdf",
    data: {
      personalDetails: {
        maritalStatus: "Single",
        annualFamilyIncome: "120000",
      },
    },
  }];
  let received;
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async (payload) => {
    received = payload;
    return {
      fields: [{
        fieldId: field.fieldId,
        status: "mapped",
        source: "documents[0].data.personalDetails.maritalStatus",
        value: "Single",
        confidence: 0.99,
        reason: "The profile value matches the requested field.",
      }],
    };
  });

  try {
    const results = await mapFormFields({
      fields: [field],
      documents: profileDocuments,
      personName: "Dharm Raj Hembram",
    });
    assert.equal(received.personName, undefined);
    assert.deepEqual(received.fields[0], {
      ...field,
      id: "",
      title: "",
      formId: "",
      groupId: "",
      order: 0,
      readOnly: false,
      disabled: false,
      visible: true,
      validationMessage: "",
      describedBy: "",
      uploadAccept: "",
      uploadMultiple: false,
      concepts: ["maritalStatus"],
      tagName: "",
      role: "",
      ariaLabel: "",
      section: "",
      nearbyText: "",
    });
    assert.equal(received.documents, undefined);
    assert.deepEqual(received.facts.map(({ concept, value }) => ({ concept, value })), [
      { concept: "maritalStatus", value: "Single" },
    ]);
    assert.equal(results[0].value, "Single");
    assert.equal(results[0].status, "mapped");
  } finally {
    restore();
  }
});

test("normalizes a verified date for a native date input", async () => {
  const field = { fieldId: "birth-date", label: "DOB", type: "date", options: [] };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [mapping(field, {
      source: "documents[0].data.person.dateOfBirth",
      value: "01/01/2000",
    })],
  }));

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.value, "2000-01-01");
    assert.equal(result.status, "mapped");
  } finally {
    restore();
  }
});

test("normalizes a verified select value to the exact website option", async () => {
  const field = {
    fieldId: "gender",
    label: "Sex",
    type: "select",
    options: ["Female", "Male", "Other"],
  };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [mapping(field, {
      source: "documents[0].data.person.gender",
      value: "male",
    })],
  }));

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.value, "Male");
    assert.equal(result.status, "mapped");
  } finally {
    restore();
  }
});

test("maps radio answers only to an offered website option", async () => {
  const field = {
    fieldId: "gender",
    label: "Gender",
    type: "radio",
    options: ["Female", "Male"],
    role: "radiogroup",
    section: "Applicant gender",
  };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async ({ fields }) => {
    assert.deepEqual(fields[0].options, ["Female", "Male"]);
    assert.equal(fields[0].section, "Applicant gender");
    return {
      fields: [mapping(field, {
        source: "documents[0].data.person.gender",
        value: "Male",
      })],
    };
  });

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.status, "mapped");
    assert.equal(result.value, "Male");
  } finally {
    restore();
  }
});

test("preserves a valid false value for a checkbox", async () => {
  const field = { fieldId: "is-minor", label: "Is the applicant a minor?", type: "checkbox", options: [] };
  const profile = [{
    documentType: "Profile",
    fileType: "application/json",
    data: { person: { isMinor: false } },
  }];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [{
      fieldId: field.fieldId,
      status: "mapped",
      source: "documents[0].data.person.isMinor",
      value: false,
      confidence: 0.99,
      reason: "The profile explicitly records false.",
    }],
  }));

  try {
    const [result] = await mapFormFields({ fields: [field], documents: profile });
    assert.equal(result.status, "mapped");
    assert.equal(result.value, false);
    assert.equal(result.requiresConfirmation, false);
  } finally {
    restore();
  }
});

test("maps explicit boolean and gender values to equivalent radio options", async () => {
  const fields = [
    { fieldId: "resident", label: "Resident?", type: "radio", options: ["Yes", "No"] },
    { fieldId: "gender", label: "Gender", type: "radio", options: ["Male", "Female"] },
  ];
  const profile = [{
    documentType: "Profile",
    fileType: "application/json",
    data: { person: { isResident: false, gender: "M" } },
  }];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [
      {
        fieldId: "resident",
        status: "mapped",
        source: "documents[0].data.person.isResident",
        value: "No",
        confidence: 0.99,
        reason: "The profile records that the applicant is not a resident.",
      },
      {
        fieldId: "gender",
        status: "mapped",
        source: "documents[0].data.person.gender",
        value: "Male",
        confidence: 0.99,
        reason: "The profile abbreviation matches the available option.",
      },
    ],
  }));

  try {
    const results = await mapFormFields({ fields, documents: profile });
    assert.deepEqual(results.map(({ status, value }) => [status, value]), [
      ["mapped", "No"],
      ["mapped", "Male"],
    ]);
  } finally {
    restore();
  }
});

test("prefers a more authoritative source when documents disagree", async () => {
  const field = { fieldId: "name", label: "Candidate Name", type: "text", options: [] };
  const documents = [
    {
      documentType: "Resume",
      fileType: "application/pdf",
      data: { personalDetails: { fullName: "Dharam Raj Hembram" } },
    },
    {
      documentType: "Passport",
      fileType: "application/pdf",
      data: { person: { fullName: "Dharm Raj Hembram" } },
    },
  ];
  let received;
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async (payload) => {
    received = payload;
    const fact = payload.facts[0];
    return { fields: [mapping(field, { source: fact.source, value: fact.value })] };
  });

  try {
    const [result] = await mapFormFields({ fields: [field], documents });
    assert.equal(received.facts.length, 1);
    assert.equal(received.facts[0].documentType, "Passport");
    assert.equal(result.status, "mapped");
    assert.equal(result.value, "Dharm Raj Hembram");
    assert.equal(result.provenance.documentType, "Passport");
  } finally {
    restore();
  }
});

test("returns conflicting authoritative choices for user selection", async () => {
  const field = { fieldId: "dob", label: "Date of Birth", type: "date", options: [] };
  const documents = [
    {
      documentType: "Passport",
      fileType: "application/pdf",
      data: { person: { dateOfBirth: "2000-01-01" } },
    },
    {
      documentType: "Passport",
      fileType: "application/pdf",
      data: { personalDetails: { dateOfBirth: "2001-02-02" } },
    },
  ];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => {
    throw new Error("Gemini should not receive a known unresolved conflict.");
  });

  try {
    const [result] = await mapFormFields({ fields: [field], documents });
    assert.equal(result.status, "ambiguous");
    assert.equal(result.requiresConfirmation, true);
    assert.deepEqual(result.choices.map(({ value }) => value), ["2000-01-01", "2001-02-02"]);
    assert.ok(result.choices.every(({ documentType }) => documentType === "Passport"));
  } finally {
    restore();
  }
});

test("does not infer culturally variable name components and derives ISO date components", () => {
  const facts = extractCanonicalFacts([{
    documentType: "Passport",
    data: {
      person: { fullName: "Dharm Raj Hembram", dateOfBirth: "2000-01-01" },
      document: { aadhaarNumber: "123456789012" },
    },
  }]);
  const firstName = relevantFactsForField({
    label: "First Name",
    type: "text",
  }, facts);
  const birthYear = relevantFactsForField({
    label: "Year of Birth",
    type: "select",
  }, facts);

  assert.equal(firstName.candidates.length, 0);
  assert.equal(birthYear.candidates[0].value, "2000");
  assert.equal(facts.some(({ concept }) => concept === "aadhaar"), true);
});

test("extracts country-neutral address components and matches month dropdown labels", () => {
  const facts = extractCanonicalFacts([{
    documentType: "Aadhaar Card",
    data: {
      personalDetails: {
        address: "Village: Kandra, District: Bokaro, State: Jharkhand, PIN: 827013",
      },
    },
  }]);
  const district = relevantFactsForField({ label: "District of Residence" }, facts);
  const postalCode = relevantFactsForField({ label: "Postcode" }, facts);
  assert.equal(district.candidates[0].value, "Bokaro");
  assert.equal(postalCode.candidates[0].value, "827013");
  assert.equal(
    valueMatchesSource({ type: "select", options: ["January", "February"] }, "02", "February"),
    "February",
  );
});

test("maps global English synonyms without merging administrative address levels", () => {
  const facts = extractCanonicalFacts([{
    documentType: "Verified profile",
    data: {
      person: {
        firstName: "Alex",
        lastName: "Taylor",
        postalCode: "SW1A 1AA",
        administrativeRegion: "England",
        county: "Greater London",
        city: "London",
        phoneNumber: "+44 20 7946 0958",
      },
    },
  }]);
  const cases = [
    ["Forename", "firstName", "Alex"],
    ["Family Name", "lastName", "Taylor"],
    ["ZIP Code", "postalCode", "SW1A 1AA"],
    ["Province", "administrativeRegion", "England"],
    ["County", "county", "Greater London"],
    ["Town", "locality", undefined],
    ["Cell Phone", "phoneNumber", "+44 20 7946 0958"],
  ];

  for (const [label, concept, value] of cases) {
    const factsForField = relevantFactsForField({ label }, facts);
    assert.ok(factsForField.concepts.includes(concept), `${label} should identify ${concept}`);
    if (value !== undefined) assert.equal(factsForField.candidates[0]?.value, value);
  }
  assert.notDeepEqual(
    relevantFactsForField({ label: "County" }, facts).candidates,
    relevantFactsForField({ label: "Province" }, facts).candidates,
  );
});

test("uses standardized autocomplete tokens to identify globally portable fields", () => {
  const mappings = [
    [{ autocomplete: "given-name" }, "firstName"],
    [{ autocomplete: "family-name" }, "lastName"],
    [{ autocomplete: "address-level1" }, "administrativeRegion"],
    [{ autocomplete: "address-level2" }, "city"],
    [{ autocomplete: "postal-code" }, "postalCode"],
    [{ type: "tel" }, "phoneNumber"],
    [{ type: "email" }, "email"],
  ];
  for (const [field, concept] of mappings) {
    assert.ok(
      relevantFactsForField(field, []).concepts.includes(concept),
      `${JSON.stringify(field)} should identify ${concept}`,
    );
  }
});

test("keeps country-specific identity numbers distinct from generic national IDs", () => {
  const facts = extractCanonicalFacts([{
    documentType: "Identity records",
    data: {
      identifiers: {
        socialSecurityNumber: "111-22-3333",
        aadhaarNumber: "123456789012",
        nationalIdentifier: "ID-42",
      },
    },
  }]);
  const ssn = relevantFactsForField({ label: "Social Security Number" }, facts);
  const aadhaar = relevantFactsForField({ label: "Aadhaar Number" }, facts);
  const genericId = relevantFactsForField({ label: "National ID" }, facts);

  assert.deepEqual(ssn.candidates.map(({ value }) => value), ["111-22-3333"]);
  assert.deepEqual(aadhaar.candidates.map(({ value }) => value), ["123456789012"]);
  assert.deepEqual(genericId.candidates.map(({ value }) => value), ["ID-42"]);
});

test("matches a uniquely identified upload to an available document and exact constraints", async () => {
  const field = {
    fieldId: "passport-upload",
    label: "Upload passport",
    type: "file",
    required: true,
    uploadAccept: ".pdf,application/pdf",
    nearbyText: "Maximum file size 2 MB",
    options: [],
  };
  const documents = [{
    documentId: "passport-doc",
    documentType: "Passport",
    fileType: "application/pdf",
    fileSize: 1_000_000,
    data: { person: { fullName: "Alex Taylor" } },
  }];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => {
    throw new Error("File matching should use library metadata, not Gemini.");
  });
  try {
    const [result] = await mapFormFields({ fields: [field], documents });
    assert.equal(result.status, "mapped");
    assert.equal(result.decision, "fill");
    assert.equal(result.action.type, "upload");
    assert.equal(result.action.upload.documentId, "passport-doc");
    assert.equal(result.action.evidence, "Passport");
    assert.equal(result.source, "documents[0].documentId");
  } finally {
    restore();
  }
});

test("does not auto-upload when file requirements fail or matches are ambiguous", async () => {
  const fields = [
    {
      fieldId: "pdf-only",
      label: "Upload Aadhaar",
      type: "file",
      required: true,
      uploadAccept: ".pdf",
      options: [],
    },
    {
      fieldId: "ambiguous",
      label: "Upload passport",
      type: "file",
      required: true,
      options: [],
    },
  ];
  const documents = [
    { documentId: "aadhaar-image", documentType: "Aadhaar Card", fileType: "image/jpeg", fileSize: 800_000, data: {} },
    { documentId: "passport-one", documentType: "Passport", fileType: "application/pdf", fileSize: 1000, data: {} },
    { documentId: "passport-two", documentType: "Passport", fileType: "application/pdf", fileSize: 1000, data: {} },
  ];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => {
    throw new Error("File matching should not use Gemini.");
  });
  try {
    const results = await mapFormFields({ fields, documents });
    assert.deepEqual(results.map(({ status, decision, action }) => [status, decision, action.type]), [
      ["invalid", "ask_user", "ask_user"],
      ["ambiguous", "ask_user", "ask_user"],
    ]);
  } finally {
    restore();
  }
});

test("only formats a phone number when every verified digit is preserved", () => {
  const field = { type: "tel" };
  assert.equal(
    valueMatchesSource(field, "+1 202 555 0199", "+1 (202) 555-0199"),
    "+1 (202) 555-0199",
  );
  assert.equal(valueMatchesSource(field, "+1 202 555 0199", "+44 202 555 0199"), undefined);
});

test("does not choose between ambiguous regional date interpretations", () => {
  assert.equal(
    valueMatchesSource({ type: "date" }, "01/02/2000", "2000-02-01"),
    undefined,
  );
});

test("formats verified dates only to an explicit international field format", () => {
  const source = "2000-02-01";
  assert.equal(
    valueMatchesSource({
      type: "text",
      label: "Date of Birth",
      placeholder: "DD/MM/YYYY",
    }, source, "01/02/2000"),
    "01/02/2000",
  );
  assert.equal(
    valueMatchesSource({
      type: "text",
      label: "Date of Birth",
      placeholder: "MM/DD/YYYY",
    }, source, "02/01/2000"),
    "02/01/2000",
  );
  assert.equal(
    valueMatchesSource({
      type: "text",
      label: "Date of Birth",
      placeholder: "DD/MM/YYYY",
    }, source, "02/01/2000"),
    undefined,
  );
});

test("returns a safe action for every field and forwards explicit site context", async () => {
  const fields = [
    { fieldId: "citizenship", label: "Citizenship status", type: "select", required: true, options: ["Citizen", "Other"] },
    { fieldId: "email", label: "Verify Email Address", type: "email", required: true, options: [] },
    { fieldId: "missing", label: "Preferred name", type: "text", required: true, options: [] },
    { fieldId: "optional", label: "Middle name", type: "text", required: false, options: [] },
    { fieldId: "upload", label: "Upload passport scan", type: "file", required: true, options: [] },
  ];
  const documents = [{
    documentType: "Profile",
    data: { person: { email: "alex@example.com" } },
  }];
  let receivedWebsite;
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async ({ fields: mapped, website }) => {
    receivedWebsite = website;
    const field = mapped[0];
    const fact = documents[0].data.person.email;
    return {
      fields: [{
        fieldId: field.fieldId,
        status: "mapped",
        source: "documents[0].data.person.email",
        value: fact,
        confidence: 0.99,
        reason: "Verified email matches the confirmation field.",
      }],
    };
  });

  try {
    const results = await mapFormFields({
      fields,
      documents,
      website: { url: "https://example.co.uk", title: "Application", language: "en-GB", country: "United Kingdom" },
    });
    assert.deepEqual(receivedWebsite, {
      url: "https://example.co.uk",
      title: "Application",
      language: "en-GB",
      country: "United Kingdom",
      currentStep: "",
      actions: [],
    });
    assert.deepEqual(results.map(({ decision }) => decision), [
      "review",
      "fill",
      "ask_user",
      "skip",
      "ask_user",
    ]);
    assert.ok(results.every((result) =>
      "fieldId" in result &&
      "action" in result &&
      "value" in result &&
      "source" in result &&
      "confidence" in result &&
      "reason" in result,
    ));
    assert.deepEqual(results[1].action, {
      type: "type",
      fieldId: "email",
      value: "alex@example.com",
      source: "documents[0].data.person.email",
      evidence: "Profile",
      confidence: 0.9,
      reason: "Verified email matches the confirmation field.",
      semanticKey: "email",
    });
  } finally {
    restore();
  }
});

test("returns control-specific structured actions and pauses for search suggestions", async () => {
  const fields = [
    { fieldId: "name", label: "Full Name", type: "text", options: [] },
    { fieldId: "dob", label: "Date of Birth", type: "date", options: [] },
    { fieldId: "gender", label: "Gender", type: "radio", options: ["Male", "Female"] },
    { fieldId: "resident", label: "Are you a resident?", type: "checkbox", options: [] },
    { fieldId: "city-search", label: "Search city", type: "search", options: [] },
  ];
  const documents = [{
    documentType: "Profile",
    data: {
      person: {
        fullName: "Alex Taylor",
        dateOfBirth: "2000-02-01",
        gender: "Female",
        isResident: true,
        city: "London",
      },
    },
  }];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async ({ fields: batch, facts }) => ({
    fields: batch.map((field) => {
      const fact = facts.find(({ fieldId }) => fieldId === field.fieldId);
      return mapping(field, {
        source: fact.source,
        value: field.fieldId === "gender" ? "Female" : fact.value,
      });
    }),
  }));
  try {
    const results = await mapFormFields({ fields, documents });
    assert.deepEqual(results.map(({ decision, action }) => [decision, action.type]), [
      ["fill", "type"],
      ["fill", "date"],
      ["fill", "select"],
      ["fill", "check"],
      ["ask_user", "search"],
    ]);
  } finally {
    restore();
  }
});

test("keeps passwords, OTPs, and declarations out of Gemini mappings", async (t) => {
  const fields = [
    { fieldId: "password", label: "Account password", type: "text", options: [] },
    { fieldId: "otp", label: "One-time verification code", type: "text", options: [] },
    { fieldId: "declaration", label: "I agree to the declaration", type: "checkbox", options: [] },
  ];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => {
    throw new Error("Sensitive/user-controlled fields must not be sent to Gemini.");
  });

  try {
    const results = await mapFormFields({ fields, documents: [document] });
    assert.deepEqual(results.map(({ status, value }) => [status, value]), [
      ["unsupported", null],
      ["unsupported", null],
      ["unsupported", null],
    ]);
  } finally {
    restore();
  }
});

test("requires user confirmation for a medium-confidence mapping", async () => {
  const field = { fieldId: "name", label: "Full Name", type: "text", options: [] };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [mapping(field, { confidence: 0.82 })],
  }));

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.status, "mapped");
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.value, "Dharm Raj Hembram");
  } finally {
    restore();
  }
});

test("suppresses values below the confirmation confidence threshold", async () => {
  const field = { fieldId: "name", label: "Full Name", type: "text", options: [] };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [mapping(field, { confidence: 0.6 })],
  }));

  try {
    const [result] = await mapFormFields({ fields: [field], documents: [document] });
    assert.equal(result.status, "ambiguous");
    assert.equal(result.value, null);
    assert.equal(result.requiresConfirmation, true);
  } finally {
    restore();
  }
});

test("marks unknown sources and invented values invalid", async (t) => {
  const field = { fieldId: "name", label: "Full Name", type: "text", options: [] };
  const cases = [
    mapping(field, { source: "documents[3].data.person.fullName" }),
    mapping(field, { value: "Someone Else" }),
  ];

  for (const [index, candidate] of cases.entries()) {
    await t.test(`invalid AI response ${index + 1}`, async () => {
      const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
        fields: [candidate],
      }));
      try {
        const [result] = await mapFormFields({ fields: [field], documents: [document] });
        assert.equal(result.status, "invalid");
        assert.equal(result.value, null);
      } finally {
        restore();
      }
    });
  }
});

test("conflicting values across documents are returned as ambiguous", async () => {
  const field = { fieldId: "name", label: "Full Name", type: "text", options: [] };
  const otherDocument = {
    ...document,
    data: { person: { persons: [{ fullName: "Different Person" }] } },
  };
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [mapping(field)],
  }));

  try {
    const [result] = await mapFormFields({
      fields: [field],
      documents: [document, otherDocument],
    });
    assert.equal(result.status, "ambiguous");
    assert.equal(result.value, null);
  } finally {
    restore();
  }
});

test("preserves missing results and reports unsupported field types without calling Gemini", async () => {
  const fields = [
    { fieldId: "occupation", label: "Occupation", type: "text", options: [] },
    { fieldId: "signature", label: "Signature", type: "file", options: [] },
  ];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => ({
    fields: [{
      fieldId: "occupation",
      status: "missing",
      source: null,
      value: null,
      confidence: 0,
      reason: "No stored occupation.",
    }],
  }));

  try {
    const results = await mapFormFields({ fields, documents: [document] });
    assert.deepEqual(results.map(({ status, value }) => [status, value]), [
      ["missing", null],
      ["unsupported", null],
    ]);
  } finally {
    restore();
  }
});

test("rejects malformed field payloads and unsafe source paths", async () => {
  await assert.rejects(
    mapFormFields({ fields: [{ fieldId: "duplicate", label: "Name", type: "text" }, { fieldId: "duplicate", label: "DOB", type: "date" }], documents: [] }),
    /invalid/u,
  );
  assert.equal(
    getAtPath([document], "documents[0].data.person.persons[0].fullName"),
    "Dharm Raj Hembram",
  );
  assert.equal(getAtPath([document], "documents[0].data.__proto__.polluted"), undefined);
});

test("uses session-confirmed answers only for supported, non-sensitive fields", async () => {
  const fields = [
    { fieldId: "missing", label: "Preferred name", type: "text", options: [] },
    { fieldId: "country", label: "Country of residence", type: "select", options: ["Canada", "United Kingdom"] },
    { fieldId: "password", label: "Password", type: "text", options: [] },
    { fieldId: "declaration", label: "I agree to the declaration", type: "checkbox", options: [] },
  ];
  const restore = replace(geminiFormMappingService, "mapFormFieldsWithGemini", async () => {
    throw new Error("Explicit answers do not require Gemini.");
  });
  try {
    const results = await mapFormFields({
      fields,
      documents: [],
      userAnswers: {
        missing: "Alex",
        country: "Canada",
        password: "secret",
        declaration: "check",
      },
    });
    assert.deepEqual(results.map(({ decision, value, action }) => [decision, value, action.type]), [
      ["fill", "Alex", "type"],
      ["fill", "Canada", "select"],
      ["skip", null, "skip"],
      ["review", null, "review"],
    ]);
  } finally {
    restore();
  }
});
