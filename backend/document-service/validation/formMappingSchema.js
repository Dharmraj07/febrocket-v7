const FIELD_STATUSES = new Set([
  "mapped",
  "ambiguous",
  "missing",
  "invalid",
  "unsupported",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateFormMappingRequest(body) {
  if (!isRecord(body) || !Array.isArray(body.fields) || !Array.isArray(body.documents)) {
    throw new Error("A fields array and documents array are required.");
  }
  if (
    body.personName !== undefined &&
    (typeof body.personName !== "string" || body.personName.length > 120)
  ) {
    throw new Error("The selected person name is invalid.");
  }
  if (body.fields.length > 80 || body.documents.length > 20) {
    throw new Error("Form mapping request exceeds the supported size.");
  }

  const fieldIds = new Set();
  const fields = body.fields.map((field) => {
    if (
      !isRecord(field) ||
      typeof field.fieldId !== "string" ||
      !field.fieldId.trim() ||
      field.fieldId.length > 160 ||
      fieldIds.has(field.fieldId) ||
      typeof field.type !== "string" ||
      !field.type.trim() ||
      field.type.length > 32 ||
      typeof field.label !== "string" ||
      field.label.length > 200
    ) {
      throw new Error("A form field is invalid.");
    }
    fieldIds.add(field.fieldId);
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
        throw new Error(`Form field ${key} is invalid.`);
      }
    }
    if (field.required !== undefined && typeof field.required !== "boolean") {
      throw new Error("Form field required is invalid.");
    }
    if (
      field.options !== undefined &&
      (!Array.isArray(field.options) ||
        field.options.length > 100 ||
        field.options.some((option) => typeof option !== "string" || option.length > 160))
    ) {
      throw new Error("Form field options are invalid.");
    }
    return {
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
      readOnly: Boolean(field.readOnly),
      disabled: Boolean(field.disabled),
      visible: field.visible !== false,
      validationMessage: field.validationMessage || "",
      describedBy: field.describedBy || "",
      uploadAccept: field.uploadAccept || "",
      uploadMultiple: Boolean(field.uploadMultiple),
      required: Boolean(field.required),
      options: field.options || [],
    };
  });

  const documents = body.documents.map((document) => {
    if (
      !isRecord(document) ||
      !isRecord(document.data) ||
      (document.documentType !== undefined &&
        (typeof document.documentType !== "string" || document.documentType.length > 100)) ||
      (document.fileType !== undefined &&
        (typeof document.fileType !== "string" || document.fileType.length > 100))
    ) {
      throw new Error("A document data entry is invalid.");
    }
    return {
      documentId: typeof document.documentId === "string" ? document.documentId.slice(0, 120) : "",
      documentType: document.documentType || "unknown",
      fileType: document.fileType || "",
      fileSize: Number.isFinite(document.fileSize) && document.fileSize >= 0 ? document.fileSize : 0,
      data: document.data,
    };
  });
  if (Buffer.byteLength(JSON.stringify(documents), "utf8") > 700_000) {
    throw new Error("Document data exceeds the supported size.");
  }

  const website = isRecord(body.website) ? {
    url: typeof body.website.url === "string" ? body.website.url.slice(0, 2048) : "",
    title: typeof body.website.title === "string" ? body.website.title.slice(0, 200) : "",
    language: typeof body.website.language === "string" ? body.website.language.slice(0, 35) : "",
    country: typeof body.website.country === "string" ? body.website.country.slice(0, 100) : "",
    currentStep: typeof body.website.currentStep === "string" ? body.website.currentStep.slice(0, 200) : "",
    actions: Array.isArray(body.website.actions)
      ? body.website.actions.slice(0, 30).filter((action) =>
        isRecord(action) &&
        typeof action.label === "string" &&
        action.label.length <= 120 &&
        typeof action.type === "string" &&
        action.type.length <= 32 &&
        typeof action.disabled === "boolean",
      )
      : [],
  } : {};
  const userAnswers = {};
  if (body.userAnswers !== undefined) {
    if (!isRecord(body.userAnswers)) throw new Error("User-provided answers are invalid.");
    for (const [fieldId, value] of Object.entries(body.userAnswers)) {
      if (!fieldIds.has(fieldId) || typeof value !== "string" || value.length > 500) {
        throw new Error("A user-provided answer is invalid.");
      }
      userAnswers[fieldId] = value;
    }
  }
  return { fields, documents, personName: body.personName || "", website, userAnswers };
}

function validateFormMappingResults(fields, result) {
  if (!isRecord(result) || !Array.isArray(result.fields)) {
    throw new Error("Form-mapping AI returned an invalid response.");
  }

  const requestedIds = new Set(fields.map(({ fieldId }) => fieldId));
  const seenIds = new Set();
  const results = result.fields.map((field) => {
    if (
      !isRecord(field) ||
      typeof field.fieldId !== "string" ||
      !requestedIds.has(field.fieldId) ||
      seenIds.has(field.fieldId) ||
      !FIELD_STATUSES.has(field.status) ||
      !Number.isFinite(field.confidence) ||
      field.confidence < 0 ||
      field.confidence > 1
    ) {
      throw new Error("Form-mapping AI returned an invalid field.");
    }
    seenIds.add(field.fieldId);

    if (field.status === "mapped") {
      if (
        typeof field.source !== "string" ||
        !field.source.startsWith("documents[") ||
        !["string", "number", "boolean"].includes(typeof field.value) ||
        !String(field.value).trim()
      ) {
        throw new Error("Form-mapping AI returned an invalid mapped value.");
      }
    } else if (field.source != null || field.value != null) {
      throw new Error("Unmapped fields must not contain values or sources.");
    }

    return {
      fieldId: field.fieldId,
      status: field.status,
      source: field.source || null,
      value: field.value ?? null,
      confidence: field.confidence,
      reason: typeof field.reason === "string" ? field.reason.slice(0, 300) : "",
    };
  });

  for (const { fieldId } of fields) {
    if (!seenIds.has(fieldId)) {
      results.push({
        fieldId,
        status: "missing",
        source: null,
        value: null,
        confidence: 0,
        reason: "No mapping was returned for this field.",
      });
    }
  }
  return results;
}

module.exports = { validateFormMappingRequest, validateFormMappingResults };
