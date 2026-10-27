const crypto = require("node:crypto");
const mongoose = require("mongoose");
const documentLibraryService = require("../services/documentLibraryService");
const { prepareMappingDocuments } = require("../services/formMappingPayload");
const { classifyField, extractCanonicalFacts, relevantFactsForField } = require("../services/personFacts");
const formMappingService = require("../services/formMappingService");
const formSessionStore = require("../services/formSessionStore");

function requireUser(req, res) {
  if (req.user?.id) return String(req.user.id);
  res.status(401).json({
    success: false,
    code: "UNAUTHORIZED",
    message: "Authentication required.",
  });
  return null;
}

async function ownedLibrary(libraryId, userId) {
  if (typeof libraryId !== "string" || !mongoose.Types.ObjectId.isValid(libraryId)) return null;
  return documentLibraryService.getUserLibrary({ libraryId, userId });
}

function validateHttpUrl(url) {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

async function createFormSession(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  const url = validateHttpUrl(req.body?.url);
  if (!url || typeof req.body?.libraryId !== "string") {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "A valid libraryId and HTTP(S) form URL are required.",
    });
  }
  if (
    req.body.title !== undefined &&
    (typeof req.body.title !== "string" || req.body.title.length > 200)
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "Invalid form title.",
    });
  }

  try {
    const library = await ownedLibrary(
      req.body.libraryId,
      req.workspaceOwnerId || userId,
    );
    if (!library) {
      return res.status(404).json({
        success: false,
        code: "FORM_NOT_FOUND",
        message: "The selected person library was not found.",
      });
    }
    const sessionId = crypto.randomUUID();
    formSessionStore.createSession({
      sessionId,
      userId,
      libraryId: String(library._id),
      url: url.href,
      title: req.body.title,
    });
    return res.status(201).json({ success: true, sessionId, status: "created" });
  } catch {
    return res.status(503).json({
      success: false,
      code: "FORM_SESSION_FAILED",
      message: "Could not create a form session.",
    });
  }
}

function getAuthorizedSession(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return null;
  const url = req.body?.url === undefined ? undefined : validateHttpUrl(req.body.url)?.href;
  if (req.body?.url !== undefined && !url) {
    res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "Invalid form URL.",
    });
    return null;
  }
  const session = formSessionStore.getSession({
    sessionId: req.body?.sessionId,
    userId,
    libraryId: req.body?.libraryId,
    url,
  });
  if (!session) {
    res.status(404).json({
      success: false,
      code: "SESSION_EXPIRED",
      message: "The form session is unavailable or has expired. Start again.",
    });
    return null;
  }
  return { userId, session };
}

function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length > 80) return false;
  const fieldIds = new Set();
  return fields.every((field) => {
    if (
      !isRecord(field) ||
      typeof field.fieldId !== "string" ||
      !field.fieldId.trim() ||
      field.fieldId.length > 160 ||
      fieldIds.has(field.fieldId) ||
      typeof field.type !== "string" ||
      field.type.length > 32 ||
      typeof field.label !== "string" ||
      field.label.length > 200
    ) return false;
    fieldIds.add(field.fieldId);
    return true;
  });
}

async function analyzeForm(req, res) {
  const authorized = getAuthorizedSession(req, res);
  if (!authorized) return;
  if (!validateFields(req.body.fields)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "A valid fields array is required.",
    });
  }
  const fields = req.body.fields.map((field) => ({
    fieldId: field.fieldId,
    label: field.label,
    name: field.name || "",
    id: field.id || "",
    type: field.type,
    placeholder: field.placeholder || "",
    autocomplete: field.autocomplete || "",
    ariaLabel: field.ariaLabel || "",
    section: field.section || "",
    nearbyText: field.nearbyText || "",
    required: Boolean(field.required),
    options: field.options || [],
  }));
  return res.status(200).json({
    success: true,
    fields: fields.map((field) => ({
      fieldId: field.fieldId,
      semanticKey: classifyField(field).concepts[0] || null,
      concepts: classifyField(field).concepts,
      required: field.required,
      options: field.options,
    })),
  });
}

async function getFormContext(req, res) {
  const authorized = getAuthorizedSession(req, res);
  if (!authorized) return;
  if (!validateFields(req.body.fields)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "A valid fields array is required.",
    });
  }
  try {
    const library = await ownedLibrary(
      authorized.session.libraryId,
      req.workspaceOwnerId || authorized.userId,
    );
    if (!library) {
      return res.status(404).json({
        success: false,
        code: "FORM_NOT_FOUND",
        message: "The selected person library was not found.",
      });
    }
    const facts = extractCanonicalFacts(prepareMappingDocuments(library));
    return res.status(200).json({
      success: true,
      fields: req.body.fields.map((field) => {
        const factSet = relevantFactsForField(field, facts);
        return {
          fieldId: field.fieldId,
          facts: factSet.candidates.map((fact) => ({
            concept: fact.concept,
            value: fact.value,
            source: fact.source,
            documentType: fact.documentType,
            confidence: fact.authority,
          })),
          ambiguous: !factSet.resolved && factSet.candidates.length > 1,
        };
      }),
    });
  } catch {
    return res.status(503).json({
      success: false,
      code: "AI_ANALYSIS_FAILED",
      message: "Could not retrieve relevant person evidence.",
    });
  }
}

async function resolveFormField(req, res) {
  const authorized = getAuthorizedSession(req, res);
  if (!authorized) return;
  const { fieldId, value } = req.body || {};
  if (
    typeof fieldId !== "string" ||
    !fieldId.trim() ||
    fieldId.length > 160 ||
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "A valid fieldId and answer are required.",
    });
  }
  try {
    formSessionStore.resolveField({ session: authorized.session, fieldId, value });
  } catch {
    return res.status(413).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "This form session cannot accept more answers.",
    });
  }
  return res.status(200).json({ success: true, status: "resolved" });
}

async function recordFormFeedback(req, res) {
  const authorized = getAuthorizedSession(req, res);
  if (!authorized) return;
  const allowedStatuses = new Set(["filled", "skipped", "user_corrected", "user_rejected", "failed"]);
  const results = req.body?.results;
  if (
    !Array.isArray(results) ||
    results.length > 100 ||
    results.some((result) =>
      !isRecord(result) ||
      typeof result.fieldId !== "string" ||
      result.fieldId.length > 160 ||
      !allowedStatuses.has(result.status) ||
      Object.keys(result).some((key) => !["fieldId", "status"].includes(key)),
    )
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FORM_DATA",
      message: "Feedback must contain only fieldId and an allowed status.",
    });
  }
  formSessionStore.addFeedback({ session: authorized.session, results });
  return res.status(200).json({ success: true, received: results.length });
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateRequest(body) {
  if (!isRecord(body) || typeof body.libraryId !== "string") {
    return "A valid libraryId is required.";
  }
  if (!mongoose.Types.ObjectId.isValid(body.libraryId)) {
    return "Invalid document library ID.";
  }
  if (!isRecord(body.website) || typeof body.website.url !== "string") {
    return "Website details are required.";
  }
  try {
    const url = new URL(body.website.url);
    if (!["http:", "https:"].includes(url.protocol)) return "Invalid website URL.";
  } catch {
    return "Invalid website URL.";
  }
  if (
    body.website.title !== undefined &&
    (typeof body.website.title !== "string" || body.website.title.length > 200)
  ) {
    return "Invalid website title.";
  }
  if (
    body.website.language !== undefined &&
    (typeof body.website.language !== "string" || body.website.language.length > 35)
  ) {
    return "Invalid website language.";
  }
  if (
    body.website.country !== undefined &&
    (typeof body.website.country !== "string" || body.website.country.length > 100)
  ) {
    return "Invalid website country.";
  }
  if (
    body.website.currentStep !== undefined &&
    (typeof body.website.currentStep !== "string" || body.website.currentStep.length > 200)
  ) {
    return "Invalid current form step.";
  }
  if (
    body.website.actions !== undefined &&
    (!Array.isArray(body.website.actions) ||
      body.website.actions.length > 30 ||
      body.website.actions.some((action) =>
        !isRecord(action) ||
        typeof action.label !== "string" ||
        action.label.length > 120 ||
        typeof action.type !== "string" ||
        action.type.length > 32 ||
        typeof action.disabled !== "boolean",
      ))
  ) {
    return "Invalid form actions.";
  }
  if (body.website.url.length > 2048) return "Invalid website URL.";
  if (
    body.sessionId !== undefined &&
    (typeof body.sessionId !== "string" || body.sessionId.length > 80)
  ) {
    return "Invalid form session ID.";
  }
  if (!Array.isArray(body.fields) || body.fields.length > 80) {
    return "A valid form fields array is required.";
  }

  const ids = new Set();
  for (const field of body.fields) {
    if (
      !isRecord(field) ||
      typeof field.fieldId !== "string" ||
      !field.fieldId.trim() ||
      field.fieldId.length > 160 ||
      ids.has(field.fieldId) ||
      typeof field.type !== "string" ||
      !field.type.trim() ||
      field.type.length > 32 ||
      typeof field.label !== "string" ||
      field.label.length > 200
    ) {
      return "A form field is invalid.";
    }
    ids.add(field.fieldId);
    for (const key of [
      "id",
      "name",
      "title",
      "placeholder",
      "autocomplete",
      "tagName",
      "role",
      "ariaLabel",
      "section",
      "nearbyText",
      "formId",
      "groupId",
      "validationMessage",
      "describedBy",
      "uploadAccept",
    ]) {
      if (field[key] !== undefined && (typeof field[key] !== "string" || field[key].length > 200)) {
        return `Form field ${key} is invalid.`;
      }
    }
    if (field.required !== undefined && typeof field.required !== "boolean") {
      return "Form field required is invalid.";
    }
    if (
      field.options !== undefined &&
      (!Array.isArray(field.options) ||
        field.options.length > 100 ||
        field.options.some((option) => typeof option !== "string" || option.length > 160))
    ) {
      return "Form field options are invalid.";
    }
  }
  return null;
}

async function mapFormFields(req, res) {
  const validationError = validateRequest(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    const library = await documentLibraryService.getUserLibrary({
      libraryId: req.body.libraryId,
      userId: req.workspaceOwnerId || userId,
    });
    if (!library) {
      return res.status(404).json({ success: false, message: "Document library not found." });
    }
    let session;
    if (req.body.sessionId) {
      session = formSessionStore.getSession({
        sessionId: req.body.sessionId,
        userId,
        libraryId: String(library._id),
        url: req.body.website.url,
      });
      if (!session) {
        return res.status(404).json({
          success: false,
          code: "SESSION_EXPIRED",
          message: "The form session is unavailable or has expired. Start again.",
        });
      }
    }

    const fields = req.body.fields.map((field) => ({
      fieldId: field.fieldId,
      id: field.id || "",
      name: field.name || "",
      title: field.title || "",
      label: field.label,
      type: field.type,
      placeholder: field.placeholder || "",
      autocomplete: field.autocomplete || "",
      tagName: field.tagName || "",
      role: field.role || "",
      ariaLabel: field.ariaLabel || "",
      section: field.section || "",
      nearbyText: field.nearbyText || "",
      formId: field.formId || "",
      groupId: field.groupId || "",
      order: Number.isInteger(field.order) ? field.order : 0,
      readOnly: field.readOnly === true,
      disabled: field.disabled === true,
      visible: field.visible !== false,
      validationMessage: field.validationMessage || "",
      describedBy: field.describedBy || "",
      uploadAccept: field.uploadAccept || "",
      uploadMultiple: Boolean(field.uploadMultiple),
      required: Boolean(field.required),
      options: field.options || [],
    }));
    const documents = prepareMappingDocuments(library);
    if (fields.length === 0) {
      return res.status(200).json({
        success: true,
        mappingId: crypto.randomUUID(),
        libraryId: String(library._id),
        fields: [],
      });
    }

    const mappedFields = await formMappingService.mapFormFields({
      personName: String(library.name || "").slice(0, 120),
      fields,
      documents,
      userAnswers: session ? formSessionStore.getAnswers(session) : {},
      website: {
        url: new URL(req.body.website.url).origin,
        title: String(req.body.website.title || "").slice(0, 200),
        language: String(req.body.website.language || "").slice(0, 35),
        country: String(req.body.website.country || "").slice(0, 100),
        currentStep: String(req.body.website.currentStep || "").slice(0, 200),
        actions: req.body.website.actions || [],
      },
    });

    return res.status(200).json({
      success: true,
      mappingId: crypto.randomUUID(),
      libraryId: String(library._id),
      fields: mappedFields,
      ...(session ? { sessionId: session.sessionId } : {}),
    });
  } catch (error) {
    console.error("Form mapping failed:", error.name || "Error");
    return res.status(503).json({
      success: false,
      message: error.message === "No Gemini API key configured for form mapping."
        ? "Form mapping is unavailable because Gemini is not configured."
        : "Form mapping could not be completed. Check Document-Service logs for details.",
    });
  }
}

module.exports = {
  analyzeForm,
  createFormSession,
  getFormContext,
  mapFormFields,
  recordFormFeedback,
  resolveFormField,
  validateRequest,
};
