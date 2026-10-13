const FACT_ALIASES = {
  fullName: ["fullname", "applicantname", "candidate name", "candidatename", "studentname", "personname"],
  legalName: ["legalname", "nameasappearingonpassport", "nameasperpassport"],
  preferredName: ["preferredname", "chosenname", "nickname"],
  previousName: ["previousname", "formername", "maidenname"],
  firstName: ["firstname", "givenname", "forename"],
  middleName: ["middlename"],
  lastName: ["lastname", "surname", "familyname"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate"],
  gender: ["gender", "sex"],
  fatherName: ["fathername", "fathersname", "fatherfullname"],
  motherName: ["mothername", "mothersname", "motherfullname"],
  address: ["address", "fulladdress", "permanentaddress", "residentialaddress", "correspondenceaddress"],
  locality: ["locality", "village", "town", "suburb", "neighborhood", "neighbourhood"],
  city: ["city", "cityname", "municipality"],
  county: ["county"],
  district: ["district", "districtname"],
  administrativeRegion: ["state", "statename", "province", "region", "territory", "administrativeregion"],
  country: ["country", "countryname"],
  postalCode: ["postalcode", "zipcode", "postcode", "pincode"],
  phoneNumber: ["mobile", "mobilenumber", "phonenumber", "phone", "contactnumber", "telephone", "cellphone"],
  email: ["email", "emailaddress"],
  education: ["education", "qualification", "highestqualification", "degree", "course", "educationalqualification"],
  employer: ["employer", "company", "organization", "organisation", "currentemployer"],
  jobTitle: ["jobtitle", "position", "occupation", "profession", "role"],
  employmentStatus: ["employmentstatus", "workstatus"],
  nationalIdentifier: ["nationalidentifier", "nationalid", "identitynumber", "identitydocumentnumber"],
  aadhaar: ["aadhaar", "aadhaarnumber", "uid", "uidnumber", "uidainumber"],
  pan: ["pan", "pannumber", "permanentaccountnumber"],
  socialSecurityNumber: ["ssn", "socialsecuritynumber"],
  individualTaxpayerIdentificationNumber: ["itin", "individualtaxpayeridentificationnumber"],
  socialInsuranceNumber: ["sin", "socialinsurancenumber"],
  nationalInsuranceNumber: ["nationalinsurancenumber", "nino"],
  taxFileNumber: ["tfn", "taxfilenumber"],
  passportNumber: ["passportnumber", "passportno"],
  maritalStatus: ["maritalstatus", "maritalcategory"],
  nationality: ["nationality"],
  citizenship: ["citizenship", "citizenstatus"],
  isMinor: ["isMinor", "minor"],
  isResident: ["isResident", "resident"],
  disability: ["disability", "isDisabled", "disabilityStatus"],
};

const CONCEPT_PATTERNS = [
  ["dateOfBirth", /\b(date of birth|birth date|dob|born on)\b/iu],
  ["dateOfBirth", /\b(year|month|day)\s+(?:of\s+)?birth\b/iu],
  ["firstName", /\bforename\b|\b(first|given)\s+name\b|\bname\s*[-:]\s*first\b/iu],
  ["middleName", /\bmiddle\s+name\b/iu],
  ["lastName", /\b(last|family|sur)\s*name\b|\bsurname\b/iu],
  ["legalName", /\blegal\s+name\b|\bname\s+as\s+(?:it\s+)?appears\b/iu],
  ["preferredName", /\bpreferred\s+name\b|\bname\s+you\s+(?:go\s+by|prefer)\b/iu],
  ["previousName", /\b(previous|former|maiden)\s+name\b/iu],
  ["fatherName", /\b(father|father'?s|父)\b/iu],
  ["motherName", /\b(mother|mother'?s)\b/iu],
  ["gender", /\b(gender|sex)\b/iu],
  ["locality", /\b(village|town|locality|suburb|neighbou?rhood)\b/iu],
  ["city", /\b(city|municipality)\b/iu],
  ["county", /\bcounty\b/iu],
  ["district", /\bdistrict\b/iu],
  ["administrativeRegion", /\b(state|province|region|territory|administrative\s+region)\b/iu],
  ["country", /\bcountry\b/iu],
  ["postalCode", /\b(postal\s*code|zip\s*code|postcode|pin\s*code)\b/iu],
  ["phoneNumber", /\b(mobile|cell(?:ular)?\s*phone|phone|telephone|contact\s*number)\b/iu],
  ["email", /\b(e[-\s]?mail)\b/iu],
  ["education", /\b(education|qualification|degree|course|school|college|university|marksheet)\b/iu],
  ["employer", /\b(employer|company|organization|organisation)\b/iu],
  ["jobTitle", /\b(job\s*title|position|occupation|profession|role)\b/iu],
  ["employmentStatus", /\bemployment\s+status\b|\bwork\s+status\b/iu],
  ["maritalStatus", /\b(marital|marriage)\s*(status|category)?\b/iu],
  ["nationality", /\bnationality\b/iu],
  ["citizenship", /\bcitizenship|citizen\s+status\b/iu],
  ["nationalIdentifier", /\b(national\s+id|national\s+identifier|identity\s+(?:document\s+)?number)\b/iu],
  ["aadhaar", /\b(aadhaar|aadhar|uidai|uid\s*number)\b/iu],
  ["pan", /\bpan\s*(?:number|card)?\b/iu],
  ["socialSecurityNumber", /\b(ssn|social\s+security\s+(?:number|no\.?))\b/iu],
  ["individualTaxpayerIdentificationNumber", /\b(itin|individual\s+taxpayer\s+identification\s+number)\b/iu],
  ["socialInsuranceNumber", /\b(sin|social\s+insurance\s+number)\b/iu],
  ["nationalInsuranceNumber", /\b(national\s+insurance\s+number|nino)\b/iu],
  ["taxFileNumber", /\b(tfn|tax\s+file\s+number)\b/iu],
  ["passportNumber", /\bpassport\s+(?:number|no\.?)\b/iu],
  ["isMinor", /\b(minor|under\s*age)\b/iu],
  ["isResident", /\b(resident|residency)\b/iu],
  ["disability", /\b(disability|disabled|differently\s*abled)\b/iu],
  ["address", /\b(address|residential|correspondence)\b|\b(?:permanent|current|present)\s+residence\b|\bresidence\s+address\b/iu],
  ["fullName", /\b(full\s*name|candidate\s*name|applicant\s*name|student\s*name|name\s*as\s*per)\b/iu],
];

const REVIEW_FIELD_PATTERN =
  /\b(declaration|undertaking|terms and conditions|consent|signature|eligibility|reservation|category|examination cen(?:ter|tre)|job preference|employment status|citizenship|immigration|residency|resident status|tax status|disability|ethnicity|race|veteran|criminal history|work authorization|visa status|relationship)\b/iu;
const NEVER_AUTOFILL_PATTERN =
  /\b(password|captcha|security code|verification code|one[-\s]?(?:time )?(?:password|code)|otp|mfa|2fa|authenticator code|passcode)\b/iu;

function fieldRequiresReview(field) {
  const descriptor = [
    field.type,
    field.name,
    field.label,
    field.placeholder,
    field.autocomplete,
    field.ariaLabel,
    field.section,
    field.nearbyText,
  ].join(" ");
  if (!REVIEW_FIELD_PATTERN.test(descriptor)) return false;
  return !(/\bcategory\b/iu.test(descriptor) &&
    /\bmarital\s+(?:status|category)\b/iu.test(descriptor) &&
    !/\b(caste|reservation|social category)\b/iu.test(descriptor));
}

function requiresUserAction(field) {
  const descriptor = [
    field.type,
    field.name,
    field.label,
    field.placeholder,
    field.autocomplete,
    field.ariaLabel,
    field.section,
    field.nearbyText,
  ].join(" ").toLocaleLowerCase();
  return NEVER_AUTOFILL_PATTERN.test(descriptor) || fieldRequiresReview(field);
}

function normalizedKey(value) {
  return String(value || "").replace(/([a-z])([A-Z])/gu, "$1 $2")
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function normalizedValue(value) {
  return String(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function comparableFactValue(concept, value) {
  const normalized = normalizedValue(value);
  if (concept === "gender") {
    if (["m", "male"].includes(normalized)) return "male";
    if (["f", "female"].includes(normalized)) return "female";
  }
  if (["isMinor", "isResident", "disability"].includes(concept)) {
    if (["yes", "y", "true"].includes(normalized)) return "true";
    if (["no", "n", "false"].includes(normalized)) return "false";
  }
  if (concept === "dateOfBirth") {
    const iso = normalized.match(/^(\d{4}) (\d{1,2}) (\d{1,2})$/u);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const parts = normalized.match(/^(\d{1,2}) (\d{1,2}) (\d{4})$/u);
    if (parts) {
      const first = Number(parts[1]);
      const second = Number(parts[2]);
      const year = parts[3];
      if (first > 12 && second <= 12) return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
      if (second > 12 && first <= 12) return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
      if (first === second) return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
    }
  }
  return normalized;
}

function authorityFor(concept, documentType) {
  const type = normalizedKey(documentType);
  const authorities = {
    aadhaar: { fullName: 0.95, dateOfBirth: 0.94, gender: 0.98, address: 0.98, postalCode: 0.96 },
    aadhar: { fullName: 0.95, dateOfBirth: 0.94, gender: 0.98, address: 0.98, postalCode: 0.96 },
    pan: { fullName: 0.96, dateOfBirth: 0.93, fatherName: 0.97, pan: 0.99 },
    passport: { fullName: 0.99, dateOfBirth: 0.99, gender: 0.99, address: 0.95 },
    marksheet: { fullName: 0.92, dateOfBirth: 0.9, fatherName: 0.95, motherName: 0.95, education: 0.99 },
    certificate: { fullName: 0.9, fatherName: 0.9, motherName: 0.9, education: 0.97 },
    resume: { fullName: 0.88, phoneNumber: 0.9, email: 0.9, address: 0.7, education: 0.92 },
  };
  const match = Object.keys(authorities).find((key) =>
    type.includes(key) ||
    (key === "aadhaar" && type.includes("uidai")) ||
    (key === "marksheet" && /mark|academic|school|education/u.test(type)) ||
    (key === "pan" && type.includes("permanentaccount")),
  );
  return (match && authorities[match][concept]) || 0.9;
}

function pushFact(facts, fact) {
  if (!fact || !["string", "number", "boolean"].includes(typeof fact.value)) return;
  if (typeof fact.value === "string" && !fact.value.trim()) return;
  const key = `${fact.concept}:${normalizedValue(fact.value)}`;
  const existing = facts.get(key);
  if (!existing || fact.authority > existing.authority) facts.set(key, fact);
}

function extractCanonicalFacts(documents) {
  const facts = new Map();
  for (const [documentIndex, document] of documents.entries()) {
    const documentType = String(document.documentType || "unknown");
    const visit = (value, path, parentKey = "") => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`, parentKey));
        return;
      }
      if (!value || typeof value !== "object") {
        if (!["string", "number", "boolean"].includes(typeof value)) return;
        const key = normalizedKey(parentKey);
        const concept = Object.keys(FACT_ALIASES).find((candidate) =>
          FACT_ALIASES[candidate].some((alias) => normalizedKey(alias) === key),
        );
        if (!concept) return;
        const base = {
          concept,
          value,
          source: path,
          documentType,
          authority: authorityFor(concept, documentType),
          derived: false,
        };
        pushFact(facts, base);
        if (concept === "dateOfBirth" && typeof value === "string") {
          const date = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
          if (date) {
            const [year, month, day] = date.slice(1);
            for (const [dateConcept, dateValue] of [
              ["birthYear", year],
              ["birthMonth", month],
              ["birthDay", day],
            ]) {
              pushFact(facts, {
                ...base,
                concept: dateConcept,
                value: dateValue,
                authority: Math.max(0.65, base.authority - 0.03),
                derived: true,
              });
            }
          }
        }
        if (concept === "address" && typeof value === "string") {
          const postal = value.match(/\b(?:postal\s*code|post\s*code|postcode|zip\s*code|zipcode|pin(?:\s*code)?|pincode)\s*[:#-]?\s*([A-Z0-9]{2,8}(?:[ -][A-Z0-9]{2,8})?)\b/iu);
          if (postal) {
            pushFact(facts, {
              ...base,
              concept: "postalCode",
              value: postal[1].trim(),
              authority: Math.max(0.65, base.authority - 0.03),
              derived: true,
            });
          }
          for (const [locationConcept, label] of [
            ["locality", "village|town|locality|suburb|neighbou?rhood"],
            ["city", "city|municipality"],
            ["county", "county"],
            ["district", "district"],
            ["administrativeRegion", "state|province|region|territory"],
            ["country", "country"],
          ]) {
            const location = value.match(new RegExp(`\\b(?:${label})\\s*[:,-]\\s*([^,;\\n]+)`, "iu"));
            if (location?.[1]?.trim()) {
              pushFact(facts, {
                ...base,
                concept: locationConcept,
                value: location[1].trim(),
                authority: Math.max(0.65, base.authority - 0.03),
                derived: true,
              });
            }
          }
        }
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`, key);
      }
    };
    visit(document.data, `documents[${documentIndex}].data`);
  }

  return [...facts.values()];
}

function classifyField(field) {
  const primary = [
    field.id,
    field.label,
    field.name,
    field.placeholder,
    field.autocomplete,
    field.ariaLabel,
  ].filter(Boolean).join(" ");
  const context = [field.section, field.nearbyText].filter(Boolean).join(" ");
  const normalizeDescriptor = (value) => value
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
  const normalizedPrimary = normalizeDescriptor(primary);
  const normalized = normalizedPrimary || normalizeDescriptor(context);
  const confirmation = /\b(confirm|verify|re-?enter|repeat)\b/iu.test(normalized);
  const concepts = [];
  for (const [concept, pattern] of CONCEPT_PATTERNS) {
    if (pattern.test(normalized)) concepts.push(concept);
  }
  const autocompleteConcepts = {
    "given-name": "firstName",
    "additional-name": "middleName",
    "family-name": "lastName",
    "bday": "dateOfBirth",
    email: "email",
    tel: "phoneNumber",
    "address-level1": "administrativeRegion",
    "address-level2": "city",
    "address-level3": "locality",
    "postal-code": "postalCode",
    "country-name": "country",
    organization: "employer",
    "organization-title": "jobTitle",
  };
  const autocompleteConcept = autocompleteConcepts[field.autocomplete?.trim().toLocaleLowerCase()];
  if (autocompleteConcept) concepts.push(autocompleteConcept);
  if (concepts.length === 0 && context) {
    for (const [concept, pattern] of CONCEPT_PATTERNS) {
      if (pattern.test(normalizeDescriptor(context))) concepts.push(concept);
    }
  }
  if (concepts.length === 0 && field.type === "tel") concepts.push("phoneNumber");
  if (concepts.length === 0 && field.type === "email") concepts.push("email");
  if (/\bday\b/iu.test(normalized) && concepts.includes("dateOfBirth")) concepts.push("birthDay");
  if (/\b(month)\b/iu.test(normalized) && concepts.includes("dateOfBirth")) concepts.push("birthMonth");
  if (/\b(year)\b/iu.test(normalized) && concepts.includes("dateOfBirth")) concepts.push("birthYear");
  if (concepts.includes("birthDay")) concepts.splice(concepts.indexOf("dateOfBirth"), 1);
  if (concepts.includes("birthMonth")) concepts.splice(concepts.indexOf("dateOfBirth"), 1);
  if (concepts.includes("birthYear")) concepts.splice(concepts.indexOf("dateOfBirth"), 1);
  if (confirmation && concepts.includes("email")) concepts.splice(concepts.indexOf("email"), 0, "email");
  if (confirmation && concepts.includes("mobile")) concepts.splice(concepts.indexOf("mobile"), 0, "mobile");
  return { concepts: [...new Set(concepts)], confirmation };
}

function compareAuthority(left, right) {
  return right.authority - left.authority;
}

function relevantFactsForField(field, facts) {
  const { concepts, confirmation } = classifyField(field);
  const candidates = facts.filter((fact) => concepts.includes(fact.concept)).sort(compareAuthority);
  const distinct = [];
  for (const fact of candidates) {
    if (!distinct.some((candidate) =>
      comparableFactValue(candidate.concept, candidate.value) ===
      comparableFactValue(fact.concept, fact.value),
    )) {
      distinct.push(fact);
    }
  }
  const top = distinct[0];
  const second = distinct[1];
  const resolved = Boolean(top && (!second || top.authority - second.authority >= 0.04));
  return {
    concepts,
    confirmation,
    resolved,
    candidates: resolved && top ? [top] : distinct.slice(0, 5),
  };
}

module.exports = {
  authorityFor,
  classifyField,
  extractCanonicalFacts,
  fieldRequiresReview,
  normalizedValue,
  requiresUserAction,
  relevantFactsForField,
};
