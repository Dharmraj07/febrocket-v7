function normalizeRequirements(input = {}) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input;
  }

  return {};
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPdfMime(mimeType) {
  return mimeType === "application/pdf" || mimeType === "application/x-pdf";
}

function getFormatLabel(format) {
  if (!format) return null;
  return String(format).trim().toLowerCase();
}

function validateRequirements(documentInfo = {}, requirementsInput = {}) {
  const requirements = normalizeRequirements(requirementsInput);
  const issues = [];
  const actualFormat = getFormatLabel(documentInfo.format || documentInfo.mimeType || "");
  const expectedFormat = getFormatLabel(requirements.format);

  if (expectedFormat && actualFormat && expectedFormat !== actualFormat) {
    issues.push({
      type: "format",
      expected: expectedFormat,
      actual: actualFormat,
    });
  }

  if (expectedFormat && !actualFormat) {
    issues.push({
      type: "format",
      expected: expectedFormat,
      actual: null,
    });
  }

  const maxSize = toNumber(requirements.maxSize);
  if (maxSize !== null && toNumber(documentInfo.size) !== null && Number(documentInfo.size) > maxSize) {
    issues.push({
      type: "size",
      expected: `<=${maxSize}`,
      actual: Number(documentInfo.size),
    });
  }

  const minSize = toNumber(requirements.minSize);
  if (minSize !== null && toNumber(documentInfo.size) !== null && Number(documentInfo.size) < minSize) {
    issues.push({
      type: "size",
      expected: `>=${minSize}`,
      actual: Number(documentInfo.size),
    });
  }

  const width = toNumber(documentInfo.width);
  const height = toNumber(documentInfo.height);

  if (requirements.width !== undefined) {
    const expectedWidth = toNumber(requirements.width);
    if (expectedWidth !== null && width !== null && width !== expectedWidth) {
      issues.push({
        type: "width",
        expected: expectedWidth,
        actual: width,
      });
    }
  }

  if (requirements.height !== undefined) {
    const expectedHeight = toNumber(requirements.height);
    if (expectedHeight !== null && height !== null && height !== expectedHeight) {
      issues.push({
        type: "height",
        expected: expectedHeight,
        actual: height,
      });
    }
  }

  if (requirements.minWidth !== undefined) {
    const expectedMin = toNumber(requirements.minWidth);
    if (expectedMin !== null && width !== null && width < expectedMin) {
      issues.push({
        type: "width",
        expected: `>=${expectedMin}`,
        actual: width,
      });
    }
  }

  if (requirements.maxWidth !== undefined) {
    const expectedMax = toNumber(requirements.maxWidth);
    if (expectedMax !== null && width !== null && width > expectedMax) {
      issues.push({
        type: "width",
        expected: `<=${expectedMax}`,
        actual: width,
      });
    }
  }

  if (requirements.minHeight !== undefined) {
    const expectedMin = toNumber(requirements.minHeight);
    if (expectedMin !== null && height !== null && height < expectedMin) {
      issues.push({
        type: "height",
        expected: `>=${expectedMin}`,
        actual: height,
      });
    }
  }

  if (requirements.maxHeight !== undefined) {
    const expectedMax = toNumber(requirements.maxHeight);
    if (expectedMax !== null && height !== null && height > expectedMax) {
      issues.push({
        type: "height",
        expected: `<=${expectedMax}`,
        actual: height,
      });
    }
  }

  if (requirements.pageCount !== undefined) {
    const expectedPages = toNumber(requirements.pageCount);
    const actualPages = toNumber(documentInfo.pageCount);
    if (expectedPages !== null && actualPages !== null && actualPages !== expectedPages) {
      issues.push({
        type: "pageCount",
        expected: expectedPages,
        actual: actualPages,
      });
    }
  }

  if (requirements.minPages !== undefined) {
    const minimumPages = toNumber(requirements.minPages);
    const actualPages = toNumber(documentInfo.pageCount);
    if (minimumPages !== null && actualPages !== null && actualPages < minimumPages) {
      issues.push({
        type: "pageCount",
        expected: `>=${minimumPages}`,
        actual: actualPages,
      });
    }
  }

  if (requirements.maxPages !== undefined) {
    const maximumPages = toNumber(requirements.maxPages);
    const actualPages = toNumber(documentInfo.pageCount);
    if (maximumPages !== null && actualPages !== null && actualPages > maximumPages) {
      issues.push({
        type: "pageCount",
        expected: `<=${maximumPages}`,
        actual: actualPages,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function buildPlan(documentInfo = {}, requirementsInput = {}) {
  const requirements = normalizeRequirements(requirementsInput);
  const operationNames = [];
  const actualFormat = getFormatLabel(documentInfo.format);
  const requiredFormat = getFormatLabel(requirements.format);
  const actualSize = toNumber(documentInfo.size);
  const requiredMaxSize = toNumber(requirements.maxSize);
  const requiredMinSize = toNumber(requirements.minSize);

  if (requiredFormat && actualFormat && actualFormat !== requiredFormat) {
    operationNames.push(`convert_to_${requiredFormat}`);
  }

  if (requirements.width !== undefined || requirements.height !== undefined) {
    const width = toNumber(documentInfo.width);
    const height = toNumber(documentInfo.height);
    const targetWidth = toNumber(requirements.width);
    const targetHeight = toNumber(requirements.height);
    if ((targetWidth !== null && width !== null && width !== targetWidth) || (targetHeight !== null && height !== null && height !== targetHeight)) {
      operationNames.push("crop");
      operationNames.push("resize");
    }
  }

  if (requiredMaxSize !== null && actualSize !== null && actualSize > requiredMaxSize) {
    operationNames.push("compress");
    if (requiredFormat && requiredFormat === "pdf") {
      operationNames.push("compress_pdf");
    }
  }

  if (requiredMinSize !== null && actualSize !== null && actualSize < requiredMinSize) {
    operationNames.push("optimize");
  }

  if (operationNames.length === 0) {
    return [];
  }

  const unique = [];
  for (const operation of operationNames) {
    if (!unique.includes(operation)) {
      unique.push(operation);
    }
  }

  return unique;
}

module.exports = {
  normalizeRequirements,
  validateRequirements,
  buildPlan,
  getFormatLabel,
  isPdfMime,
};
