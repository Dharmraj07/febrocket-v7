const geminiFormMappingService = require("./geminiFormMappingService");
const {
  validateFormMappingRequest,
  validateFormMappingResults,
} = require("../validation/formMappingSchema");
const {
  classifyField,
  extractCanonicalFacts,
  fieldRequiresReview,
  normalizedValue,
  requiresUserAction,
  relevantFactsForField,
} = require("./personFacts");

const SAFE_CONFIDENCE_THRESHOLD = 0.9;
const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.7;
const AI_FIELD_BATCH_SIZE = 10;
const MAPPABLE_TYPES = new Set([
  "text",
  "search",
  "url",
  "date",
  "datetime-local",
  "email",
  "number",
  "tel",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "combobox",
  "multiselect",
  "file",
]);

function normalizeValue(value) {
  return String(value).trim().normalize("NFKC");
}

function operationForField(field, value) {
  if (field.type === "file") return "upload";
  if (field.type === "checkbox") return value === true ? "check" : "uncheck";
  if (["select", "radio", "combobox", "multiselect"].includes(field.type)) return "select";
  if (field.type === "date" || field.type === "datetime-local") return "date";
  if (field.type === "search") return "search";
  return "type";
}

function questionForField(field) {
  const descriptor = [field.label, field.name, field.section].join(" ").toLocaleLowerCase();
  if (/\bexamination cen(?:ter|tre)\b/u.test(descriptor)) {
    return "Which examination centre would you prefer?";
  }
  if (/\b(job|work)\s+preference\b/u.test(descriptor)) {
    return "Which job or work preference should be selected?";
  }
  if (/\b(caste|reservation|social)\s+category\b/u.test(descriptor)) {
    return "Which category is shown on your verified certificate?";
  }
  if (/\bcategory\b/u.test(descriptor) && !/\bmarital\b/u.test(descriptor)) {
    return "Which category applies to you? Please use your verified records.";
  }
  if (field.type === "file") return `Which document should be uploaded for "${field.label}"?`;
  return `The form asks "${field.label}". What answer should be used?`;
}

function matchUploadDocument(field, documents) {
  const descriptor = [
    field.label,
    field.name,
    field.id,
    field.section,
    field.nearbyText,
    field.describedBy,
    field.title,
  ].join(" ").toLocaleLowerCase();
  const types = [
    ["aadhaar", /\b(aadhaar|aadhar|uidai)\b/iu, /\b(aadhaar|aadhar|uidai)\b/iu],
    ["pan", /\bpan\b/iu, /\bpan\b/iu],
    ["passport", /\bpassport\b/iu, /\bpassport\b/iu],
    ["marksheet", /\b(mark\s*sheet|marksheet|transcript|grade\s*sheet)\b/iu, /\b(mark|academic|transcript|grade)\b/iu],
    ["degree", /\b(degree|diploma|graduation)\b/iu, /\b(degree|diploma|graduation)\b/iu],
    ["caste", /\b(caste|social\s+category)\b/iu, /\b(caste|social\s+category)\b/iu],
    ["domicile", /\b(domicile|residence\s+certificate)\b/iu, /\b(domicile|residence)\b/iu],
    ["income", /\bincome\b/iu, /\bincome\b/iu],
    ["experience", /\b(experience|employment)\b/iu, /\b(experience|employment)\b/iu],
    ["resume", /\b(resume|cv|curriculum\s+vitae)\b/iu, /\b(resume|cv|curriculum)\b/iu],
  ];
  const requested = types.find(([, pattern]) => pattern.test(descriptor));
  if (!requested) return { status: "missing", reason: "The required document type could not be identified." };
  const [documentKind, , documentPattern] = requested;
  const candidates = documents
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => Boolean(document.documentId) && documentPattern.test(document.documentType));
  if (candidates.length !== 1) {
    return {
      status: candidates.length > 1 ? "ambiguous" : "missing",
      reason: candidates.length > 1
        ? `More than one ${documentKind} document is available; choose the correct one.`
        : `No matching ${documentKind} document is available in this person's library.`,
    };
  }
  const { document, index } = candidates[0];
  const requirements = [
    field.uploadAccept,
    field.nearbyText,
    field.describedBy,
    field.validationMessage,
    field.title,
  ].join(" ").toLocaleLowerCase();
  const mime = String(document.fileType || "").toLocaleLowerCase();
  const accept = String(field.uploadAccept || "").split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean);
  const typeAllowed = accept.length === 0 || accept.some((item) =>
    item.startsWith(".")
      ? (item === ".pdf" && mime === "application/pdf") ||
        ([".jpg", ".jpeg"].includes(item) && mime === "image/jpeg") ||
        (item === ".png" && mime === "image/png")
      : item.endsWith("/*")
        ? mime.startsWith(item.slice(0, -1))
        : item === mime,
  );
  if (!typeAllowed) {
    return { status: "invalid", reason: "The matching document does not meet the website's accepted file type." };
  }
  const sizeLimit = requirements.match(/\b(?:max(?:imum)?|under|less than|up to|not exceed)\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb)\b/u);
  if (sizeLimit) {
    const multiplier = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[sizeLimit[2]];
    if (document.fileSize > Number(sizeLimit[1]) * multiplier) {
      return { status: "invalid", reason: "The matching document exceeds the stated file-size limit." };
    }
  }
  if (/\b\d{2,5}\s*[x×]\s*\d{2,5}\s*(?:px|pixels?)\b/u.test(requirements)) {
    return { status: "unsupported", reason: "The website requires image-dimension conversion that is not available." };
  }
  return {
    status: "mapped",
    source: `documents[${index}].documentId`,
    value: document.documentId,
    confidence: 0.97,
    reason: `One matching ${documentKind} document meets the known upload requirements.`,
    provenance: { documentType: document.documentType, authority: 0.97, derived: false },
    upload: {
      documentId: document.documentId,
      documentType: document.documentType,
      fileType: mime,
      fileSize: document.fileSize,
    },
  };
}

function getAtPath(root, path) {
  if (
    !Array.isArray(root) ||
    !/^documents\[\d+\]\.data(?:\.[A-Za-z0-9_$]+|\[\d+\])*$/u.test(path)
  ) return undefined;
  const segments = path.replace(/\[(\d+)\]/gu, ".$1").split(".");
  if (segments.shift() !== "documents") return undefined;
  const index = Number(segments.shift());
  if (!Number.isInteger(index) || index < 0 || index >= root.length) return undefined;
  let value = root[index];
  for (const segment of segments) {
    if (["__proto__", "prototype", "constructor"].includes(segment)) return undefined;
    if (!value || typeof value !== "object" || !(segment in value)) return undefined;
    value = value[segment];
  }
  return value;
}

function normalizeOption(value, options) {
  const normalized = normalizeValue(value).toLocaleLowerCase();
  return options.find((option) => normalizeValue(option).toLocaleLowerCase() === normalized);
}

function equivalentDocumentOption(source, option) {
  const normalizedSource = normalizeValue(source).toLocaleLowerCase().replace(/[^a-z0-9]/gu, "");
  const normalizedOption = normalizeValue(option).toLocaleLowerCase().replace(/[^a-z0-9]/gu, "");
  const equivalences = [
    ["yes", "y", "true"],
    ["no", "n", "false"],
    ["male", "m"],
    ["female", "f"],
  ];
  if (equivalences.some((group) =>
    group.includes(normalizedSource) && group.includes(normalizedOption),
  )) return true;
  const monthNames = [
    ["1", "01", "january", "jan"],
    ["2", "02", "february", "feb"],
    ["3", "03", "march", "mar"],
    ["4", "04", "april", "apr"],
    ["5", "05", "may"],
    ["6", "06", "june", "jun"],
    ["7", "07", "july", "jul"],
    ["8", "08", "august", "aug"],
    ["9", "09", "september", "sep", "sept"],
    ["10", "october", "oct"],
    ["11", "november", "nov"],
    ["12", "december", "dec"],
  ];
  return monthNames.some((group) =>
    group.includes(normalizedSource) && group.includes(normalizedOption),
  );
}

function parseDateParts(value) {
  const normalized = normalizeValue(value);
  const yearFirst = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u);
  if (yearFirst) {
    return [{ year: Number(yearFirst[1]), month: Number(yearFirst[2]), day: Number(yearFirst[3]) }];
  }
  const dayFirst = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u);
  if (dayFirst) {
    return [
      { year: Number(dayFirst[3]), month: Number(dayFirst[2]), day: Number(dayFirst[1]) },
      { year: Number(dayFirst[3]), month: Number(dayFirst[1]), day: Number(dayFirst[2]) },
    ];
  }
  return [];
}

function isValidDateParts({ year, month, day }) {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

function normalizedDateValue(field, source, proposed) {
  const sourceDateParts = parseDateParts(source).filter(isValidDateParts);
  const distinctSourceDates = new Map(sourceDateParts.map((part) => [
    `${part.year}-${part.month}-${part.day}`,
    part,
  ]));
  if (distinctSourceDates.size !== 1) return undefined;
  const [sourceParts] = distinctSourceDates.values();
  const proposedParts = parseDateParts(proposed).filter(isValidDateParts);
  if (!proposedParts.some((part) =>
    part.year === sourceParts.year &&
    part.month === sourceParts.month &&
    part.day === sourceParts.day,
  )) return undefined;

  const year = String(sourceParts.year).padStart(4, "0");
  const month = String(sourceParts.month).padStart(2, "0");
  const day = String(sourceParts.day).padStart(2, "0");
  if (field.type === "date") return `${year}-${month}-${day}`;
  if (field.type === "datetime-local") return normalizeValue(proposed);

  const dateHint = [
    field.placeholder,
    field.label,
    field.name,
    field.nearbyText,
  ].join(" ").match(/\b([dmy]{1,4})[./ -]([dmy]{1,4})[./ -]([dmy]{1,4})\b/iu);
  if (dateHint) {
    const tokens = dateHint.slice(1).map((token) => token.toLocaleLowerCase());
    const yearIndex = tokens.findIndex((token) => token.startsWith("y") && token.length === 4);
    const dayIndex = tokens.findIndex((token) => token.startsWith("d"));
    const monthIndex = tokens.findIndex((token) => token.startsWith("m"));
    if (yearIndex < 0 || dayIndex < 0 || monthIndex < 0) return undefined;
    const expected = tokens.map((token) => {
      if (token.startsWith("y")) return year;
      if (token.startsWith("m")) return token.length === 1 ? String(sourceParts.month) : month;
      return token.length === 1 ? String(sourceParts.day) : day;
    }).join(dateHint[0].match(/[./ -]/u)?.[0] || "/");
    return normalizeValue(proposed) === normalizeValue(expected) ? expected : undefined;
  }
  return normalizeValue(proposed);
}

function valueMatchesSource(field, source, proposed) {
  if (["select", "radio", "multiselect"].includes(field.type) && field.options.length > 0) {
    const option = normalizeOption(proposed, field.options);
    if (!option) return undefined;
    if (normalizedValue(source) === normalizedValue(option) ||
      equivalentDocumentOption(source, option)) return option;
    return undefined;
  }
  if (typeof source === "boolean" || typeof proposed === "boolean") {
    return source === proposed ? proposed : undefined;
  }
  if (typeof source === "number" || typeof proposed === "number") {
    return Number.isFinite(Number(proposed)) && Number(source) === Number(proposed)
      ? Number(proposed)
      : undefined;
  }
  if (
    ["date", "datetime-local"].includes(field.type) ||
    classifyField(field).concepts.some((concept) =>
      ["dateOfBirth", "birthDay", "birthMonth", "birthYear"].includes(concept),
    )
  ) {
    return normalizedDateValue(field, source, proposed);
  }
  if (field.type === "tel") {
    const sourceText = String(source);
    const proposedText = String(proposed);
    const validPhoneCharacters = /^[+\d().\s-]+$/u;
    const sourceDigits = sourceText.replace(/\D/gu, "");
    const proposedDigits = proposedText.replace(/\D/gu, "");
    return sourceDigits.length >= 4 &&
      sourceDigits === proposedDigits &&
      validPhoneCharacters.test(sourceText) &&
      validPhoneCharacters.test(proposedText)
      ? proposedText.trim()
      : undefined;
  }
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(proposed))) {
    return undefined;
  }
  if (field.type === "number" && !Number.isFinite(Number(proposed))) {
    return undefined;
  }
  return normalizedValue(source) === normalizedValue(proposed)
    ? normalizeValue(source)
    : undefined;
}

function getThreshold(key, fallback) {
  const value = process.env[key] === undefined ? fallback : Number(process.env[key]);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${key} must be a number between 0 and 1.`);
  }
  return value;
}

function makeChoices(candidates) {
  return candidates.map(({ value, source, documentType, authority }) => ({
    value,
    source,
    documentType,
    confidence: authority,
  }));
}

function validateResults(fields, aiResult, factsByField) {
  const results = validateFormMappingResults(fields, aiResult);
  const confidenceThreshold = getThreshold(
    "FORM_MAPPING_CONFIDENCE_THRESHOLD",
    SAFE_CONFIDENCE_THRESHOLD,
  );
  const confirmationThreshold = Math.min(
    confidenceThreshold,
    getThreshold("FORM_MAPPING_CONFIRMATION_THRESHOLD", CONFIRMATION_CONFIDENCE_THRESHOLD),
  );

  return results.map((result) => {
    const factSet = factsByField.get(result.fieldId);
    if (result.status !== "mapped") {
      return {
        ...result,
        choices: result.status === "ambiguous" ? makeChoices(factSet?.candidates || []) : [],
        requiresConfirmation: result.status === "ambiguous",
      };
    }

    const field = fields.find(({ fieldId }) => fieldId === result.fieldId);
    const candidate = factSet?.candidates.find((fact) =>
      fact.source === result.source &&
      (normalizedValue(fact.value) === normalizedValue(result.value) ||
        valueMatchesSource(field, fact.value, result.value) !== undefined),
    );
    if (!candidate) {
      return {
        ...result,
        status: "invalid",
        source: null,
        value: null,
        requiresConfirmation: true,
        reason: "The suggested answer could not be verified against a relevant person fact.",
      };
    }

    const verifiedValue = valueMatchesSource(field, candidate.value, result.value);
    if (verifiedValue === undefined) {
      return {
        ...result,
        status: "invalid",
        source: null,
        value: null,
        requiresConfirmation: true,
        reason: "The suggested answer did not match its source fact.",
      };
    }

    const confidence = Math.min(result.confidence, candidate.authority);
    if (confidence < confirmationThreshold) {
      return {
        ...result,
        status: "ambiguous",
        source: null,
        value: null,
        choices: makeChoices(factSet?.candidates || []),
        requiresConfirmation: true,
        reason: result.reason || "The match confidence is too low to suggest a value.",
      };
    }

    return {
      ...result,
      value: verifiedValue,
      confidence,
      requiresConfirmation: confidence < confidenceThreshold,
      provenance: {
        documentType: candidate.documentType,
        authority: candidate.authority,
        derived: candidate.derived,
      },
    };
  });
}

async function mapFormFields(payload) {
  const { fields, documents, personName, website, userAnswers = {} } =
    validateFormMappingRequest(payload);
  if (fields.length === 0) return [];

  const canonicalFacts = extractCanonicalFacts(documents);
  const factsByField = new Map();
  const analyzedFields = [];
  const immediateResults = new Map();

  for (const field of fields) {
    const factSet = relevantFactsForField(field, canonicalFacts);
    factsByField.set(field.fieldId, factSet);
    if (requiresUserAction(field)) {
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        status: "unsupported",
        source: null,
        value: null,
        confidence: 0,
        reason: "This field must be completed by the user.",
        requiresConfirmation: true,
      });
    } else if (Object.hasOwn(userAnswers, field.fieldId) && field.type !== "file") {
      const answer = userAnswers[field.fieldId];
      const option = field.type === "checkbox"
        ? answer.toLocaleLowerCase() === "check"
          ? true
          : answer.toLocaleLowerCase() === "uncheck"
            ? false
            : undefined
        : ["select", "radio", "combobox", "multiselect"].includes(field.type)
        ? normalizeOption(answer, field.options)
        : answer;
      if (
        typeof answer !== "string" ||
        !answer.trim() ||
        (field.type === "checkbox" && option === undefined) ||
        (["select", "radio", "combobox", "multiselect"].includes(field.type) && !option)
      ) {
        immediateResults.set(field.fieldId, {
          fieldId: field.fieldId,
          status: "invalid",
          source: null,
          value: null,
          confidence: 0,
          reason: "The user-provided answer is not valid for this field or its available options.",
          requiresConfirmation: true,
        });
      } else {
        immediateResults.set(field.fieldId, {
          fieldId: field.fieldId,
          status: "mapped",
          source: `session.answers.${field.fieldId}`,
          value: option === undefined ? answer.trim() : option,
          confidence: 1,
          reason: "Explicit answer provided by the user for this form session.",
          requiresConfirmation: false,
          provenance: { documentType: "User confirmation", authority: 1, derived: false },
        });
      }
    } else if (requiresUserAction(field)) {
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        status: "unsupported",
        source: null,
        value: null,
        confidence: 0,
        reason: "This field must be completed by the user.",
        requiresConfirmation: true,
      });
    } else if (field.type === "file") {
      const match = matchUploadDocument(field, documents);
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        ...match,
        source: match.source || null,
        value: match.value || null,
        confidence: match.confidence || 0,
        requiresConfirmation: match.status !== "mapped",
        choices: [],
      });
    } else if (!MAPPABLE_TYPES.has(field.type)) {
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        status: "unsupported",
        source: null,
        value: null,
        confidence: 0,
        reason: "This control type is not supported for automatic entry.",
        requiresConfirmation: true,
      });
    } else if (factSet.candidates.length > 1 && !factSet.resolved) {
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        status: "ambiguous",
        source: null,
        value: null,
        confidence: 0,
        reason: "Authoritative documents contain different possible values.",
        choices: makeChoices(factSet.candidates),
        requiresConfirmation: true,
      });
    } else if (factSet.candidates.length === 0) {
      const understood = classifyField(field).concepts.length > 0;
      immediateResults.set(field.fieldId, {
        fieldId: field.fieldId,
        status: understood ? "missing" : "unsupported",
        source: null,
        value: null,
        confidence: 0,
        reason: understood
          ? "The selected person's documents do not contain this information."
          : "The requested information could not be identified safely.",
        requiresConfirmation: false,
      });
    } else {
      analyzedFields.push(field);
    }
  }

  const validated = [];
  for (let offset = 0; offset < analyzedFields.length; offset += AI_FIELD_BATCH_SIZE) {
    const batch = analyzedFields.slice(offset, offset + AI_FIELD_BATCH_SIZE);
    const aiResult = await geminiFormMappingService.mapFormFieldsWithGemini({
      website,
      fields: batch.map((field) => ({
        ...field,
        concepts: factsByField.get(field.fieldId).concepts,
      })),
      facts: batch.flatMap((field) =>
        factsByField.get(field.fieldId).candidates.map((fact) => ({
          fieldId: field.fieldId,
          ...fact,
        })),
      ),
    });
    validated.push(...validateResults(batch, aiResult, factsByField));
  }
  const resultsById = new Map([
    ...immediateResults.entries(),
    ...validated.map((result) => [result.fieldId, result]),
  ]);
  return fields.map((field) => {
    const result = resultsById.get(field.fieldId);
    const searchNeedsUserSelection = field.type === "search" && result.status === "mapped";
    let decision = "skip";
    if (fieldRequiresReview(field)) decision = "review";
    else if (result.status === "mapped") {
      decision = result.requiresConfirmation || searchNeedsUserSelection ? "ask_user" : "fill";
    } else if (result.status === "ambiguous" || (result.status === "missing" && field.required)) {
      decision = "ask_user";
    } else if (result.status === "invalid") {
      decision = field.type === "file" ? "ask_user" : "review";
    }
    else if (result.status === "unsupported" && field.required) decision = "ask_user";

    const actionType = searchNeedsUserSelection
      ? "search"
      : decision === "fill"
      ? operationForField(field, result.value)
      : decision;
    const exactOption = ["select", "radio", "combobox", "multiselect"].includes(field.type)
      ? field.options.find((option) => normalizedValue(option) === normalizedValue(result.value))
      : undefined;
    return {
      ...result,
      ...(searchNeedsUserSelection ? { requiresConfirmation: true } : {}),
      decision,
      semanticKey: classifyField(field).concepts[0] || null,
      action: {
        type: actionType,
        fieldId: field.fieldId,
        value: result.value,
        source: result.source,
        evidence: result.provenance?.documentType || null,
        confidence: result.confidence,
        reason: result.reason,
        semanticKey: classifyField(field).concepts[0] || null,
        ...(exactOption ? { optionLabel: exactOption } : {}),
        ...(result.upload ? { upload: result.upload } : {}),
        ...(decision === "ask_user" ? {
          question: questionForField(field),
        } : {}),
      },
    };
  });
}

module.exports = {
  mapFormFields,
  getAtPath,
  valueMatchesSource,
  validateResults,
};
