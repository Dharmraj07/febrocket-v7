export interface DetectedField {
  fieldId: string;
  selector: string;
  name: string;
  id: string;
  type: string;
  label: string;
  placeholder: string;
  autocomplete: string;
  currentValue: string;
  selectedOption: string;
  empty: boolean;
  required: boolean;
  options: string[];
  tagName: string;
  title: string;
  formId: string;
  groupId: string;
  order: number;
  readOnly: boolean;
  disabled: boolean;
  visible: boolean;
  validationMessage: string;
  describedBy: string;
  uploadAccept: string;
  uploadMultiple: boolean;
  role: string;
  ariaLabel: string;
  section: string;
  nearbyText: string;
  sensitive: boolean;
  userEdited: boolean;
}

export interface FormScanSummary {
  totalFields: number;
  detectedControls: number;
  fields: DetectedField[];
  formCount: number;
  pageTitle: string;
  pageUrl: string;
  pageLanguage: string;
  currentStep: string;
  actions: Array<{ label: string; disabled: boolean; type: string }>;
}

export type DetectedFormSummary = FormScanSummary;

export interface LibraryDocumentEntry {
  documentId: string;
  documentType: string;
  fileType: string;
  fileSize: number;
  data: Record<string, unknown>;
}

export interface DocumentLibraryItem {
  _id: string;
  name: string;
  normalizedName: string;
  documents: LibraryDocumentEntry[];
}
