const issuerKeys = [
  "board",
  "boardName",
  "issuingBoard",
  "examBoard",
  "examiningBoard",
  "issuingAuthority",
  "issuer",
  "issuingOrganization",
  "issuingOrganisation",
  "organizationName",
  "organisationName",
  "university",
];

const yearKeys = [
  "yearOfPassing",
  "passingYear",
  "examinationYear",
  "examYear",
  "issueYear",
  "academicYear",
  "year",
  "dateOfIssue",
  "issueDate",
];

function findFieldValue(value, fieldNames, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return null;

  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (typeof fieldValue === "string" || typeof fieldValue === "number") {
      const text = String(fieldValue).trim();
      if (text) return text;
    }
  }

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const result = findFieldValue(child, fieldNames, depth + 1);
    if (result) return result;
  }

  return null;
}

function normalizeDocumentType(documentType) {
  const value = documentType.trim().replace(/\s+/gu, " ");
  if (
    /\b10(?:th|(?:\s+class)?\s+10)\b/iu.test(value) &&
    /\bmark\s*sheet\b/iu.test(value)
  ) {
    return "10th Class Marksheet";
  }

  return value;
}

function findYear(extractedData) {
  for (const key of yearKeys) {
    const value = findFieldValue(extractedData, [key]);
    const match = value?.match(/\b(?:19|20)\d{2}\b/u);
    if (match) return match[0];
  }
  return null;
}

function generateDocumentDisplayName(extractedData, fallbackName) {
  const documentType = extractedData?.document?.documentType ||
    extractedData?.documentType;
  if (
    typeof documentType !== "string" ||
    !documentType.trim() ||
    /^unknown$/iu.test(documentType.trim())
  ) {
    return fallbackName;
  }

  const parts = [normalizeDocumentType(documentType)];
  const issuer = findFieldValue(extractedData, issuerKeys);
  const year = findYear(extractedData);

  if (issuer && !parts.some((part) => part.toLowerCase() === issuer.toLowerCase())) {
    parts.push(issuer);
  }
  if (year && !parts.includes(year)) parts.push(year);

  return parts.join(" - ");
}

module.exports = { generateDocumentDisplayName };
