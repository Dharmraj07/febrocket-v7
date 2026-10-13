const MAX_DOCUMENTS = 20;
const MAX_DATA_LEAVES_PER_DOCUMENT = 60;
const MAX_VALUE_LENGTH = 500;

function normalizeWords(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function normalizePersonName(value) {
  return normalizeWords(value).replace(/\s+/gu, " ");
}

function selectLibraryPersonData(data, personName) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const person = data.person;
  if (!person || typeof person !== "object" || Array.isArray(person)) return data;

  const targetName = normalizePersonName(personName);
  const selectedPerson = { ...person };
  if (Array.isArray(person.persons)) {
    const matches = person.persons.filter((candidate) => {
      const candidateName = typeof candidate === "string" ? candidate : candidate?.fullName;
      return typeof candidateName === "string" &&
        normalizePersonName(candidateName) === targetName;
    });
    selectedPerson.persons = matches.length > 0 || person.persons.length !== 1
      ? matches
      : person.persons;
  }
  if (
    typeof person.fullName === "string" &&
    normalizePersonName(person.fullName) !== targetName &&
    (Array.isArray(person.persons) ? person.persons.length > 1 : false)
  ) {
    delete selectedPerson.fullName;
  }
  return { ...data, person: selectedPerson };
}

function pruneDocumentData(value, state) {
  if (state.leaves >= MAX_DATA_LEAVES_PER_DOCUMENT) return undefined;
  if (value instanceof Date) {
    state.leaves += 1;
    return value.toISOString();
  }
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    state.leaves += 1;
    return typeof value === "string" ? value.slice(0, MAX_VALUE_LENGTH) : value;
  }
  if (Array.isArray(value)) {
    const entries = [];
    for (const item of value) {
      const pruned = pruneDocumentData(item, state);
      if (pruned !== undefined) entries.push(pruned);
      if (state.leaves >= MAX_DATA_LEAVES_PER_DOCUMENT) break;
    }
    return entries.length > 0 ? entries : undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/giu, "").toLocaleLowerCase();
    if (["rawtext", "ocrtext", "extractedtext", "fulltext"].includes(normalizedKey)) continue;
    const pruned = pruneDocumentData(child, state);
    if (pruned !== undefined) output[key] = pruned;
    if (state.leaves >= MAX_DATA_LEAVES_PER_DOCUMENT) break;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function prepareMappingDocuments(library) {
  return library.documents.slice(0, MAX_DOCUMENTS).map((entry) => {
    const scopedData = selectLibraryPersonData(entry.data, library.name);
    const data = pruneDocumentData(scopedData, { leaves: 0 });
    return {
      documentId: String(entry.documentId),
      documentType: String(entry.documentType || "unknown").slice(0, 100),
      fileType: String(entry.fileType || "").slice(0, 100),
      fileSize: Number(entry.fileSize) || 0,
      data: data || {},
    };
  }).filter(({ data }) => Object.keys(data).length > 0);
}

module.exports = { prepareMappingDocuments, selectLibraryPersonData };
