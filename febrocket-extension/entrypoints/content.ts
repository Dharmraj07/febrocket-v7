import { browser } from 'wxt/browser';
import type { DetectedField, FormScanSummary } from '../utils/formTypes';

type FieldTarget = {
  elements: HTMLElement[];
  optionValues: string[];
  selector: string;
  sensitive: boolean;
};

type Mapping = {
  fieldId: string;
  status: string;
  value?: string | number | boolean | null;
  requiresConfirmation?: boolean;
};

type FillOutcome = {
  accepted: boolean;
  verified: boolean;
};

const identities = new WeakMap<HTMLElement, string>();
const userEditedElements = new WeakSet<HTMLElement>();
const fieldIdsByFingerprint = new Map<string, string>();
const targets = new Map<string, FieldTarget>();
let nextIdentity = 0;

function deepQueryAll<T extends Element>(
  selector: string,
  root: Document | ShadowRoot | Element = document,
): T[] {
  const matches = Array.from(root.querySelectorAll<T>(selector));
  const descendants = Array.from(root.querySelectorAll<HTMLElement>('*'));
  for (const element of descendants) {
    if (element.shadowRoot) matches.push(...deepQueryAll<T>(selector, element.shadowRoot));
  }
  return matches;
}

function identityFor(element: HTMLElement): string {
  let identity = identities.get(element);
  if (!identity) {
    identity = `field-${++nextIdentity}`;
    identities.set(element, identity);
  }
  return identity;
}

function fieldIdentity(fingerprint: string, element: HTMLElement): string {
  const existingIdentity = identities.get(element);
  if (existingIdentity) return existingIdentity;
  let identity = fieldIdsByFingerprint.get(fingerprint);
  if (!identity) {
    identity = `field-${++nextIdentity}`;
    fieldIdsByFingerprint.set(fingerprint, identity);
  }
  identities.set(element, identity);
  return identity;
}

function elementLabel(element: HTMLElement): string {
  const labelledElement = element.hasAttribute('aria-labelledby') || element.hasAttribute('aria-label')
    ? element
    : element.closest<HTMLElement>('[role="combobox"],[role="textbox"]') || element;
  const labelledBy = labelledElement.getAttribute('aria-labelledby');
  const labelRoot = element.getRootNode();
  const getLabelById = (id: string) => labelRoot instanceof ShadowRoot
    ? labelRoot.getElementById(id)
    : document.getElementById(id);
  const referencedLabels = labelledBy
    ? labelledBy.split(/\s+/u).map((id) => getLabelById(id)?.textContent?.trim() || '')
    : [];
  const input = element as HTMLInputElement;
  const labels = input.labels
    ? Array.from(input.labels, (label) => label.textContent?.trim() || '')
    : [];
  const wrappingLabel = element.closest('label')?.textContent?.trim() || '';
  const explicitLabel = labelledElement.getAttribute('aria-label') || '';
  const associatedLabel = element.id
    ? Array.from((labelRoot instanceof ShadowRoot ? labelRoot : document).querySelectorAll('label[for]'))
        .find((label) => label.getAttribute('for') === element.id)?.textContent?.trim() || ''
    : '';
  return [...referencedLabels, ...labels, wrappingLabel, explicitLabel, associatedLabel]
    .map((label) => label.replace(/\s+/gu, ' ').trim())
    .find(Boolean) || '';
}

function visibleText(element: Element | null): string {
  if (!element) return '';
  return (element.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 300);
}

function placeholderOption(value: string): boolean {
  return /^(?:--+|select(?:\s+an?)?|\s*choose(?:\s+an?)?|please\s+select|pick\s+one|select\s+one)\b/iu.test(value.trim());
}

function selectorFor(element: HTMLElement): string {
  const root = element.getRootNode();
  const queryRoot = root instanceof ShadowRoot ? root : document;
  if (element.id) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (queryRoot.querySelectorAll(idSelector).length === 1) return idSelector;
  }
  const name = element.getAttribute('name');
  if (name) {
    const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    if (queryRoot.querySelectorAll(selector).length === 1) return selector;
  }
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const tagName = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((child) => child.tagName === current?.tagName)
      : [];
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (element.getClientRects().length > 0) return true;
  if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
    const label = element.labels?.[0] || element.closest('label');
    return Boolean(label && getComputedStyle(label).display !== 'none' && label.getClientRects().length);
  }
  return false;
}

function controlType(element: HTMLElement): string {
  if (
    ['combobox', 'textbox'].includes(element.getAttribute('role') || '') &&
    element.querySelector('input,textarea')
  ) return '';
  if (element.closest('[role="combobox"]')) return 'combobox';
  if (element instanceof HTMLInputElement) return element.type.toLowerCase();
  if (element instanceof HTMLTextAreaElement) return 'textarea';
  if (element instanceof HTMLSelectElement) return element.multiple ? 'multiselect' : 'select';
  const role = element.getAttribute('role');
  if (role === 'textbox') return 'text';
  if (role === 'combobox' || element.hasAttribute('aria-autocomplete')) return 'combobox';
  if (role === 'listbox') return element.getAttribute('aria-multiselectable') === 'true' ? 'multiselect' : 'select';
  if (role === 'radio') return 'radio';
  if (role === 'checkbox') return 'checkbox';
  if (element.isContentEditable) return 'text';
  return '';
}

function credentialOrSecurityCode(text: string): boolean {
  return /\b(captcha|password|security code|verification code|one[-\s]?(?:time )?(?:password|code)|\botp\b|\bmfa\b|\b2fa\b|authenticator code|passcode)\b/iu.test(text);
}

function getRadioGroups(elements: HTMLElement[]): HTMLElement[][] {
  const groups = new Map<string, HTMLElement[]>();
  for (const element of elements) {
    const name = element.getAttribute('name');
    const role = element.getAttribute('role');
    const isRadio = (element instanceof HTMLInputElement && element.type === 'radio') || role === 'radio';
    if (!isRadio) continue;
    const groupRoot = element.closest('fieldset,[role="radiogroup"],[role="group"]') ||
      (element instanceof HTMLInputElement ? element.form : null);
    const groupName = name || (groupRoot ? 'group' : `anonymous-${identityFor(element)}`);
    const key = `${groupRoot ? identityFor(groupRoot as HTMLElement) : 'document'}:${groupName}`;
    const group = groups.get(key) || [];
    group.push(element);
    groups.set(key, group);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function customControlOptions(element: HTMLElement): string[] {
  const combo = element.closest<HTMLElement>('[role="combobox"]') || element;
  const controls = (combo.getAttribute('aria-controls') || '').split(/\s+/u).filter(Boolean);
  const rootNode = combo.getRootNode();
  const getById = (id: string) => rootNode instanceof ShadowRoot
    ? rootNode.getElementById(id)
    : document.getElementById(id);
  const roots = controls.map(getById).filter((root): root is HTMLElement => root instanceof HTMLElement);
  const listbox = combo.closest<HTMLElement>('[role="listbox"]');
  const root = roots.find((candidate) => candidate.getAttribute('role') === 'listbox') || listbox || combo;
  return deepQueryAll<HTMLElement>('[role="option"]', root)
    .filter((option) => option.getAttribute('aria-disabled') !== 'true')
    .map((option) => option.getAttribute('aria-label') || visibleText(option))
    .filter(Boolean)
    .slice(0, 100);
}

function scanPageForms(): FormScanSummary {
  const candidates = deepQueryAll<HTMLElement>(
    'input, textarea, select, [role="textbox"], [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"], [contenteditable="true"]',
  ).filter((element) => {
    const type = controlType(element);
    if (!type) return false;
    if (element instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return false;
    return isVisible(element) ||
      (element instanceof HTMLInputElement && type === 'file' && Boolean(element.parentElement && isVisible(element.parentElement)));
  });

  const radioGroups = getRadioGroups(candidates);
  const groupedElements = new Set(radioGroups.flat());
  const logicalFields: Array<{ element: HTMLElement; members: HTMLElement[] }> = [];
  for (const group of radioGroups) {
    const first = group[0];
    if (first) logicalFields.push({ element: first, members: group });
  }
  for (const element of candidates) {
    if (!groupedElements.has(element)) logicalFields.push({ element, members: [element] });
  }

  const fields: DetectedField[] = [];
  targets.clear();
  const duplicateIndexes = new Map<string, number>();
  for (const { element, members } of logicalFields) {
    const type = controlType(element);
    const root = element.closest('fieldset,[role="radiogroup"],[role="group"]');
    const section = visibleText(root);
    const label = type === 'radio'
      ? (root instanceof HTMLElement ? elementLabel(root) : '') || section
      : elementLabel(element);
    const parent = element.parentElement;
    const nearbyText = visibleText(parent);
    const labelledGroup = root
      ? root.getAttribute('aria-label') ||
        root.getAttribute('aria-labelledby')?.split(/\s+/u)
          .map((id) => document.getElementById(id)?.textContent?.trim() || '')
          .filter(Boolean)
          .join(' ') ||
        root.querySelector('legend')?.textContent?.trim() ||
        ''
      : '';
    const options = type === 'radio'
      ? members.map((member) => elementLabel(member) || (member as HTMLInputElement).value || visibleText(member))
      : element instanceof HTMLSelectElement
        ? Array.from(element.options).filter((option) => !option.disabled && option.value && !placeholderOption(option.label || option.value)).map((option) => option.label.trim() || option.value).filter(Boolean)
        : element.getAttribute('role') === 'listbox'
          ? deepQueryAll<HTMLElement>('[role="option"]', element)
            .filter((option) => option.getAttribute('aria-disabled') !== 'true')
            .map((option) => option.getAttribute('aria-label') || visibleText(option))
            .filter(Boolean)
          : type === 'combobox'
            ? customControlOptions(element)
        : [];
    const selector = selectorFor(element);
    const fingerprint = JSON.stringify([
      element.id,
      element.getAttribute('name') || '',
      type,
      section,
      nearbyText,
      type === 'radio'
        ? (root instanceof HTMLElement ? elementLabel(root) : '') || root?.querySelector('legend')?.textContent?.trim() || ''
        : label,
      labelledGroup,
      element.getAttribute('autocomplete') || '',
    ]);
    const duplicateIndex = duplicateIndexes.get(fingerprint) || 0;
    duplicateIndexes.set(fingerprint, duplicateIndex + 1);
    const fieldId = fieldIdentity(`${fingerprint}:${duplicateIndex}`, element);
    const sensitive = type === 'password' || credentialOrSecurityCode([
      label,
      element.getAttribute('name') || '',
      element.getAttribute('autocomplete') || '',
      element.getAttribute('placeholder') || '',
      section,
      nearbyText,
    ].join(' '));
    const currentValue = type === 'checkbox'
      ? String((element as HTMLInputElement).checked || element.getAttribute('aria-checked') === 'true')
      : type === 'radio'
        ? String(members.some((member) => (member as HTMLInputElement).checked || member.getAttribute('aria-checked') === 'true'))
        : element instanceof HTMLSelectElement && element.multiple
          ? Array.from(element.selectedOptions, (option) => option.value).join(',')
        : element instanceof HTMLSelectElement
          ? element.value
        : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : element.getAttribute('aria-valuetext') ||
            (element.getAttribute('role') === 'listbox'
              ? visibleText(element.querySelector('[aria-selected="true"]'))
              : element.getAttribute('role') === 'combobox'
                ? element.getAttribute('aria-label') || ''
                : element.textContent?.trim() || '');
    const describedBy = (element.getAttribute('aria-describedby') || '')
      .split(/\s+/u)
      .filter(Boolean)
      .map((id) => {
        const node = element.getRootNode() instanceof ShadowRoot
          ? (element.getRootNode() as ShadowRoot).getElementById(id)
          : document.getElementById(id);
        return node?.textContent?.trim() || '';
      })
      .filter(Boolean)
      .join(' ')
      .slice(0, 200);
    const validationMessage = element.getAttribute('aria-invalid') === 'true'
      ? describedBy || (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? element.validationMessage
        : 'The website marked this field as invalid.')
      : '';
    const empty = type === 'checkbox' || type === 'radio'
      ? currentValue === 'false'
      : element instanceof HTMLSelectElement
        ? element.multiple
          ? element.selectedOptions.length === 0
          : !element.value.trim() || Boolean(element.selectedOptions[0]?.disabled) ||
            placeholderOption(element.selectedOptions[0]?.label || element.value)
        : !currentValue.trim() || placeholderOption(currentValue);

    targets.set(fieldId, {
      elements: members,
      optionValues: type === 'radio'
        ? members.map((member) => (member as HTMLInputElement).value)
        : [],
      selector,
      sensitive,
    });

    fields.push({
      fieldId,
      id: element.id,
      label: label || element.getAttribute('aria-label') || element.getAttribute('name') || 'Unlabelled field',
      name: element.getAttribute('name') || '',
      type,
      selector,
      placeholder: element.getAttribute('placeholder') || '',
      autocomplete: element.getAttribute('autocomplete') || '',
      required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      options,
      currentValue,
      selectedOption: element instanceof HTMLSelectElement
        ? element.selectedOptions[0]?.label.trim() || ''
        : '',
      empty,
      tagName: element.tagName.toLowerCase(),
      title: element.getAttribute('title') || '',
      formId: element.closest('form')?.id || '',
      groupId: root?.id || '',
      order: fields.length,
      readOnly: element.hasAttribute('readonly') || element.getAttribute('aria-readonly') === 'true',
      disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
      visible: true,
      validationMessage,
      describedBy,
      uploadAccept: element instanceof HTMLInputElement && type === 'file'
        ? element.accept.slice(0, 200)
        : '',
      uploadMultiple: element instanceof HTMLInputElement && type === 'file' && element.multiple,
      role: element.getAttribute('role') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      section,
      nearbyText,
      sensitive,
      userEdited: members.some((member) => userEditedElements.has(member)),
    });
  }

  return {
    fields,
    totalFields: fields.length,
    detectedControls: candidates.length,
    formCount: document.forms.length,
    pageTitle: document.title,
    pageUrl: window.location.href,
    pageLanguage: document.documentElement.lang || '',
    currentStep: deepQueryAll<HTMLElement>(
      '[aria-current="step"], [aria-current="page"], [role="progressbar"]',
    )
      .filter((element) => isVisible(element))
      .map((element) => visibleText(element) || element.getAttribute('aria-valuetext') || '')
      .find(Boolean)
      ?.slice(0, 200) || '',
    actions: deepQueryAll<HTMLElement>('button, input[type="submit"], input[type="button"], [role="button"]')
      .filter((element) => isVisible(element))
      .map((element) => ({
        label: (element.getAttribute('aria-label') || visibleText(element) ||
          (element instanceof HTMLInputElement ? element.value : '')).slice(0, 120),
        disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
        type: element.getAttribute('type') || element.getAttribute('role') || 'button',
      }))
      .filter(({ label }) => Boolean(label))
      .slice(0, 30),
  };
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  { blur = true, dispatchChange = true } = {},
): void {
  element.focus();
  const prototype = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  if (dispatchChange) element.dispatchEvent(new Event('change', { bubbles: true }));
  if (blur) element.blur();
}

function attachFileToInput(input: HTMLInputElement, blob: Blob, fileName: string): void {
  const file = new File([blob], fileName, { type: blob.type });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function visibleOptions(): HTMLElement[] {
  return deepQueryAll<HTMLElement>(
    '[role="option"], [role="menuitem"], option',
  ).filter((option) => isVisible(option) && option.getAttribute('aria-disabled') !== 'true');
}

function exactOrCaseInsensitive<T>(items: T[], value: string, getText: (item: T) => string): T | undefined {
  const normalized = value.trim();
  const exact = items.filter((item) => getText(item).trim() === normalized);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const folded = normalized.toLocaleLowerCase();
  const matches = items.filter((item) => getText(item).trim().toLocaleLowerCase() === folded);
  return matches.length === 1 ? matches[0] : undefined;
}

async function fillDatePicker(input: HTMLInputElement, value: string): Promise<FillOutcome> {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return { accepted: false, verified: false };
  const [, year, month, day] = match;
  input.focus();
  input.click();
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  const expected = new Date(Number(year), Number(month) - 1, Number(day));
  const longDate = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(expected).toLocaleLowerCase();
  const options = deepQueryAll<HTMLElement>(
    '[role="gridcell"], [data-date], [aria-label], button, td',
  ).filter(isVisible);
  const matching = options.filter((option) => {
    const dataDate = option.getAttribute('data-date');
    const label = `${option.getAttribute('aria-label') || ''} ${option.getAttribute('title') || ''}`.trim().toLocaleLowerCase();
    if (dataDate === value || label === longDate) return true;
    const parsed = Date.parse(label);
    return Number.isFinite(parsed) &&
      new Date(parsed).getFullYear() === Number(year) &&
      new Date(parsed).getMonth() === Number(month) - 1 &&
      new Date(parsed).getDate() === Number(day);
  });
  if (matching.length !== 1) return { accepted: false, verified: false };
  matching[0]?.click();
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
  return { accepted: true, verified: await verifyValue(input, value) };
}

async function verifyValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  expected: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (
      element.value.trim() === expected.trim() &&
      element.getAttribute('aria-invalid') !== 'true' &&
      element.checkValidity()
    ) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return false;
}

async function verifyState(readState: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (readState()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return false;
}

async function fillTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<boolean> {
  setNativeValue(element, value);
  if (await verifyValue(element, value)) return true;

  element.focus();
  element.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: value,
  }));
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  element.blur();
  return verifyValue(element, value);
}

async function selectCustomOption(element: HTMLElement, value: string): Promise<FillOutcome> {
  element.click();
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  const option = exactOrCaseInsensitive(visibleOptions(), value, (item) =>
    item.getAttribute('aria-label') || item.innerText || item.textContent || '',
  );
  if (!option) return { accepted: false, verified: false };
  option.click();
  element.blur();
  const verified = await verifyState(() => {
    const reportedValue = element.getAttribute('aria-valuetext') ||
      element.getAttribute('aria-label') ||
      (element instanceof HTMLInputElement ? element.value : element.textContent || '');
    return reportedValue.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase() ||
      (option.isConnected && option.getAttribute('aria-selected') === 'true');
  });
  return { accepted: true, verified };
}

async function fillTarget(target: FieldTarget, field: DetectedField, value: string | number | boolean): Promise<FillOutcome> {
  const element = target.elements.find((item) => item.isConnected);
  if (!element || element.getAttribute('aria-disabled') === 'true') return { accepted: false, verified: false };
  if (target.sensitive) return { accepted: false, verified: false };

  if (field.type === 'radio') {
    const selected = target.elements.find((member, index) =>
      target.optionValues[index] === String(value) ||
      (field.options?.[index] || '').trim().toLocaleLowerCase() === String(value).trim().toLocaleLowerCase(),
    );
    if (!selected || selected.hasAttribute('disabled')) return { accepted: false, verified: false };
    const currentlyChecked = target.elements.find((member) => (member as HTMLInputElement).checked || member.getAttribute('aria-checked') === 'true');
    if (currentlyChecked) return { accepted: false, verified: currentlyChecked === selected };
    selected.click();
    return {
      accepted: true,
      verified: await verifyState(() =>
        (selected as HTMLInputElement).checked || selected.getAttribute('aria-checked') === 'true',
      ),
    };
  }

  if (field.type === 'checkbox') {
    if (typeof value !== 'boolean') return { accepted: false, verified: false };
    const checkbox = element as HTMLInputElement;
    if (checkbox.checked === value || element.getAttribute('aria-checked') === String(value)) {
      return { accepted: false, verified: true };
    }
    element.click();
    return {
      accepted: true,
      verified: await verifyState(() =>
        checkbox.checked === value || element.getAttribute('aria-checked') === String(value),
      ),
    };
  }

  if (element instanceof HTMLSelectElement && element.multiple) {
    const option = exactOrCaseInsensitive(Array.from(element.options).filter((item) => !item.disabled), String(value), (item) => item.value) ||
      exactOrCaseInsensitive(Array.from(element.options).filter((item) => !item.disabled), String(value), (item) => item.label);
    if (!option) return { accepted: false, verified: false };
    element.focus();
    option.selected = true;
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    return {
      accepted: true,
      verified: await verifyState(() => option.selected && Array.from(element.selectedOptions).includes(option)),
    };
  }
  if (element instanceof HTMLInputElement && element.readOnly && field.type === 'date') {
    setNativeValue(element, String(value));
    if (await verifyValue(element, String(value))) return { accepted: true, verified: true };
    return fillDatePicker(element, String(value));
  }
  if (element instanceof HTMLSelectElement) {
    const text = String(value);
    const availableOptions = Array.from(element.options).filter((item) => !item.disabled && item.value);
    const option = exactOrCaseInsensitive(availableOptions, text, (item) => item.value) ||
      exactOrCaseInsensitive(availableOptions, text, (item) => item.label);
    if (!option) return { accepted: false, verified: false };
    setNativeValue(element, option.value);
    return { accepted: true, verified: await verifyValue(element, option.value) };
  }

  if (element.getAttribute('role') === 'listbox' || field.type === 'select' || field.type === 'multiselect') {
    return selectCustomOption(element, String(value));
  }

  if (field.type === 'combobox' || element.getAttribute('role') === 'combobox') {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.value.trim()) return { accepted: false, verified: false };
      setNativeValue(element, String(value), { blur: false, dispatchChange: false });
    }
    return selectCustomOption(element, String(value));
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.value.trim()) return { accepted: false, verified: false };
    return { accepted: true, verified: await fillTextControl(element, String(value)) };
  }
  if (element.isContentEditable) {
    if (element.textContent?.trim()) return { accepted: false, verified: false };
    element.focus();
    element.textContent = String(value);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    await new Promise((resolve) => window.setTimeout(resolve, 75));
    return { accepted: true, verified: element.textContent?.trim() === String(value).trim() };
  }
  return { accepted: false, verified: false };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const observedRoots = new WeakSet<ShadowRoot>();
    let debouncedScanTimer: number | undefined;
    const scheduleScan = () => {
      window.clearTimeout(debouncedScanTimer);
      debouncedScanTimer = window.setTimeout(() => {
        observeOpenShadowRoots();
        const summary = scanPageForms();
        browser.runtime.sendMessage({ type: 'page-forms-updated', summary }).catch(() => undefined);
      }, 500);
    };
    const observer = new MutationObserver(scheduleScan);
    const observeOpenShadowRoots = () => {
      for (const element of deepQueryAll<HTMLElement>('*')) {
        if (element.shadowRoot && !observedRoots.has(element.shadowRoot)) {
          observedRoots.add(element.shadowRoot);
          observer.observe(element.shadowRoot, { childList: true, subtree: true, attributes: true });
        }
      }
    };
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    observeOpenShadowRoots();

    for (const eventName of ['input', 'change', 'click']) {
      document.addEventListener(eventName, (event) => {
        if (!event.isTrusted || !(event.target instanceof HTMLElement)) return;
        const label = event.target.closest('label') as HTMLLabelElement | null;
        const control = label?.control instanceof HTMLElement
          ? label.control
          : event.target.closest<HTMLElement>(
            'input, textarea, select, [role="textbox"], [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"], [contenteditable="true"]',
          );
        if (control) userEditedElements.add(control);
      }, true);
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'detect-forms' || message.type === 'scan-page-forms-request') {
        sendResponse({ success: true, summary: scanPageForms() });
        return true;
      }

      if (
        message.type === 'autofill-mapped-request' &&
        'fields' in message &&
        Array.isArray(message.fields)
      ) {
        void (async () => {
          const mappings = new Map<string, Mapping>(
            (message.fields as Mapping[]).filter((mapping) =>
              mapping.status === 'mapped' && typeof mapping.fieldId === 'string',
            ).map((mapping) => [mapping.fieldId, mapping]),
          );
          const confirmedIds = new Set(
            'confirmedFieldIds' in message && Array.isArray(message.confirmedFieldIds)
              ? message.confirmedFieldIds.map(String)
              : [],
          );
          const counts = {
            attempted: 0,
            located: 0,
            accepted: 0,
            successful: 0,
            verified: 0,
            alreadyFilled: 0,
            requiresConfirmation: 0,
            requiresUserAction: 0,
            failed: 0,
          };
          const results: Array<{ fieldId: string; status: string }> = [];
          const summary = scanPageForms();
          const fields = new Map(summary.fields.map((field) => [field.fieldId, field]));

          for (const [fieldId, mapping] of mappings) {
            const field = fields.get(fieldId);
            const target = targets.get(fieldId);
            if (!field || !target || !target.elements.some((element) => element.isConnected)) {
              counts.failed += 1;
              results.push({ fieldId, status: 'not_found' });
              continue;
            }
            counts.located += 1;
            if (target.elements.some((element) => userEditedElements.has(element))) {
              counts.alreadyFilled += 1;
              results.push({ fieldId, status: 'preserved_user_input' });
              continue;
            }
            if (target.sensitive) {
              counts.requiresUserAction += 1;
              results.push({ fieldId, status: 'requires_user_action' });
              continue;
            }
            if (!field.empty) {
              counts.alreadyFilled += 1;
              results.push({ fieldId, status: 'preserved_existing_value' });
              continue;
            }
            if (field.type === 'checkbox' && mapping.value === false) {
              counts.alreadyFilled += 1;
              results.push({ fieldId, status: 'already_in_requested_state' });
              continue;
            }
            if (mapping.requiresConfirmation && !confirmedIds.has(fieldId)) {
              counts.requiresConfirmation += 1;
              results.push({ fieldId, status: 'requires_confirmation' });
              continue;
            }
            if (mapping.value === null || mapping.value === undefined || mapping.value === '') {
              counts.failed += 1;
              results.push({ fieldId, status: 'empty_mapping' });
              continue;
            }
            counts.attempted += 1;
            try {
              const outcome = await fillTarget(target, field, mapping.value);
              if (outcome.accepted) counts.accepted += 1;
              if (outcome.verified) {
                counts.successful += 1;
                counts.verified += 1;
                results.push({ fieldId, status: 'verified' });
              } else {
                counts.failed += 1;
                results.push({ fieldId, status: 'verification_failed' });
              }
            } catch (error) {
              counts.failed += 1;
              results.push({ fieldId, status: 'error' });
              if (import.meta.env.DEV) console.warn('Form field fill failed', fieldId, error);
            }
          }

          if (import.meta.env.DEV) console.debug('FebRocket form fill diagnostics', counts, results);
          sendResponse({ success: true, ...counts, results });
        })().catch((error) => {
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Form fill failed.' });
        });
        return true;
      }

      if (message.type === 'upload-file-request' &&
        ('fieldId' in message || 'selector' in message) &&
        'fileDataUrl' in message &&
        'fileName' in message) {
        try {
          const fieldTarget = targets.get(String(message.fieldId));
          const targetedInput = fieldTarget?.elements.find((element) =>
            element instanceof HTMLInputElement && element.type === 'file',
          ) as HTMLInputElement | undefined;
          const input = targetedInput || ('selector' in message
            ? document.querySelector<HTMLInputElement>(String(message.selector))
            : null);
          if (!input || input.type !== 'file') {
            sendResponse({ success: false, error: 'Target is not a valid file input.' });
            return true;
          }

          fetch(String(message.fileDataUrl))
            .then((res) => res.blob())
            .then((blob) => {
              attachFileToInput(input, blob, String(message.fileName));
              const uploaded = input.files?.[0];
              sendResponse({
                success: Boolean(uploaded) &&
                  uploaded?.name === String(message.fileName) &&
                  uploaded.size === blob.size,
                error: uploaded ? undefined : 'The website did not accept the selected file.',
              });
            })
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        } catch (err) {
          sendResponse({ success: false, error: (err as Error).message });
          return true;
        }
      }
    });

  },
});
