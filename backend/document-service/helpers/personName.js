function normalizePersonName(name) {
  if (typeof name !== "string") return "";

  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

module.exports = { normalizePersonName };
