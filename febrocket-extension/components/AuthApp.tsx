import { Fragment, useEffect, useRef, useState } from 'react';
import {
  isAuthStateMessage,
  type AuthMessage,
  type AuthState,
} from '../utils/auth';

interface AuthAppProps {
  layout: 'popup' | 'sidepanel';
}

interface LibraryDocument {
  documentId: string;
  fileType?: string;
  fileSize?: number;
  documentType?: string;
  fileName?: string;
  data?: Record<string, any>;
}

interface DocumentLibraryItem {
  _id: string;
  name: string;
  documents: LibraryDocument[];
}

interface FormMappingResult {
  fieldId: string;
  status: 'mapped' | 'ambiguous' | 'missing' | 'invalid' | 'unsupported';
  decision: 'fill' | 'ask_user' | 'skip' | 'review';
  action: {
    type: 'type' | 'select' | 'check' | 'uncheck' | 'date' | 'upload' | 'search' | 'ask_user' | 'review' | 'skip';
    fieldId: string;
    value: string | number | boolean | null;
    source: string | null;
    evidence: string | null;
    confidence: number;
    reason: string;
    optionLabel?: string;
    question?: string;
    upload?: {
      documentId: string;
      documentType: string;
      fileType: string;
      fileSize: number;
    };
  };
  source: string | null;
  value: string | number | boolean | null;
  confidence: number;
  reason: string;
  requiresConfirmation: boolean;
  executed?: boolean;
  choices?: Array<{
    value: string | number | boolean;
    source: string;
    documentType: string;
    confidence: number;
  }>;
}

const initialState: AuthState = {
  status: 'loading',
  user: null,
  error: null,
};

export default function AuthApp({ layout }: AuthAppProps) {
  const [auth, setAuth] = useState(initialState);
  const [libraries, setLibraries] = useState<DocumentLibraryItem[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [pageSummary, setPageSummary] = useState<{
    totalFields: number;
    fields: any[];
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [mappingForm, setMappingForm] = useState(false);
  const [mappingResults, setMappingResults] = useState<FormMappingResult[]>([]);
  const [formSessionId, setFormSessionId] = useState<string>('');
  const [fieldAnswers, setFieldAnswers] = useState<Record<string, string>>({});
  const [savedAnswerIds, setSavedAnswerIds] = useState<string[]>([]);
  const [mappingDiagnostics, setMappingDiagnostics] = useState<Record<string, number> | null>(null);
  const [fillDiagnostics, setFillDiagnostics] = useState<Record<string, number> | null>(null);
  const [confirmedMappingIds, setConfirmedMappingIds] = useState<string[]>([]);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, number>>({});
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const portRef = useRef<Browser.runtime.Port | null>(null);
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (disposed) return;

      const connection = browser.runtime.connect({ name: 'febrocket-auth' });
      portRef.current = connection;
      connection.onMessage.addListener((message: unknown) => {
        if (isAuthStateMessage(message)) {
          setAuth(message.state);
        } else if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'page-forms-updated' &&
          'summary' in message &&
          typeof message.summary === 'object' &&
          message.summary !== null &&
          'totalFields' in message.summary &&
          typeof message.summary.totalFields === 'number' &&
          'fields' in message.summary &&
          Array.isArray(message.summary.fields)
        ) {
          setPageSummary(message.summary as { totalFields: number; fields: any[] });
        }
      });
      connection.onDisconnect.addListener(() => {
        if (portRef.current === connection) portRef.current = null;
        if (!disposed) reconnectTimer = window.setTimeout(connect, 500);
      });
      connection.postMessage({ type: 'refresh' } satisfies AuthMessage);
    };

    connect();
    const refreshTimer = window.setInterval(() => {
      portRef.current?.postMessage({ type: 'refresh' } satisfies AuthMessage);
    }, 30_000);

    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  // Fetch libraries and perform initial scan when authenticated
  useEffect(() => {
    if (auth.status === 'authenticated') {
      browser.runtime
        .sendMessage({ type: 'FETCH_LIBRARIES' })
        .then((res: any) => {
          if (res?.success && Array.isArray(res.libraries)) {
            setLibraries(res.libraries);
            if (res.libraries.length > 0 && !selectedLibraryId) {
              setSelectedLibraryId(res.libraries[0]._id);
            }
          }
        })
        .catch((err) => console.warn('Failed to fetch libraries:', err));

      scanCurrentPage();
    }
  }, [auth.status]);

  // Update selected doc when library changes
  useEffect(() => {
    const currentLib = libraries.find((l) => l._id === selectedLibraryId);
    if (currentLib && currentLib.documents && currentLib.documents.length > 0) {
      setSelectedDocId(currentLib.documents[0]?.documentId || '');
    } else {
      setSelectedDocId('');
    }
    setFormSessionId('');
    setSavedAnswerIds([]);
    setFieldAnswers({});
  }, [selectedLibraryId, libraries]);

  const sendAction = (type: 'open-login' | 'open-app' | 'refresh') => {
    portRef.current?.postMessage({ type } satisfies AuthMessage);
  };

  const scanCurrentPage = async () => {
    setScanning(true);
    setStatusFeedback(null);
    try {
      const res: any = await browser.runtime.sendMessage({
        type: 'SCAN_ACTIVE_TAB',
      });
      if (res?.success && res.summary) {
        setPageSummary(res.summary);
        setStatusFeedback(
          res.summary.totalFields > 0
            ? `✓ Found ${res.summary.totalFields} form field${res.summary.totalFields === 1 ? '' : 's'} on this page.`
            : 'No visible form fields found. Open the form and scan again.',
        );
      } else {
        setPageSummary(null);
        setStatusFeedback(res?.error || 'Could not scan this page.');
      }
    } catch (err) {
      console.warn('Page scan error:', err);
      setPageSummary(null);
      setStatusFeedback(err instanceof Error ? err.message : 'Could not scan this page.');
    } finally {
      setScanning(false);
    }
  };

  const handleFormMapping = async () => {
    if (!selectedLibraryId) {
      setStatusFeedback('Please select a profile first.');
      return;
    }

    setMappingForm(true);
    setMappingResults([]);
    setMappingDiagnostics(null);
    setFillDiagnostics(null);
    setConfirmedMappingIds([]);
    setChoiceSelections({});
    setStatusFeedback('Looking for matching information…');
    try {
      const result: any = await browser.runtime.sendMessage({
        type: 'MAP_FORM_ACTIVE_TAB',
        libraryId: selectedLibraryId,
        sessionId: formSessionId || undefined,
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Form mapping failed.');
      }

      const mappings: FormMappingResult[] = Array.isArray(result.fields)
        ? result.fields
        : [];
      if (typeof result.sessionId === 'string') setFormSessionId(result.sessionId);
      setMappingResults(mappings);
      setMappingDiagnostics(result.diagnostics || null);
      const safeMappings = mappings.filter(
        (field) => !field.executed && field.decision === 'fill' && field.status === 'mapped' && !field.requiresConfirmation,
      );

      let fillResult: any = {
        verified: 0,
        alreadyFilled: 0,
        failed: 0,
        attempted: 0,
        located: 0,
        successful: 0,
        requiresConfirmation: 0,
        requiresUserAction: 0,
      };
      if (result.fillDiagnostics) fillResult = result.fillDiagnostics;
      if (safeMappings.length > 0) {
        fillResult = await browser.runtime.sendMessage({
          type: 'AUTOFILL_MAPPED_FIELDS',
          fields: safeMappings,
        });
        if (!fillResult?.success) {
          throw new Error(fillResult?.error || 'Could not fill mapped fields.');
        }
        setFillDiagnostics({
          attempted: fillResult.attempted || 0,
          located: fillResult.located || 0,
          accepted: fillResult.accepted || 0,
          successful: fillResult.successful || 0,
          verified: fillResult.verified || 0,
          failed: fillResult.failed || 0,
          requiresConfirmation: fillResult.requiresConfirmation || 0,
          requiresUserAction: fillResult.requiresUserAction || 0,
        });
      }

      const needsConfirmation = mappings.filter(
        (field) => field.status === 'mapped' && field.requiresConfirmation,
      ).length;
      const needsChoice = mappings.filter(
        (field) => field.status === 'ambiguous' && Boolean(field.choices?.length),
      ).length;
      setStatusFeedback(
        (fillResult?.verified || 0) > 0
          ? `Filled ${fillResult.verified} field${fillResult.verified === 1 ? '' : 's'}.` +
            (needsConfirmation || needsChoice
              ? ` Review ${needsConfirmation + needsChoice} suggestion${needsConfirmation + needsChoice === 1 ? '' : 's'} below.`
              : '')
          : needsConfirmation
            ? `Review ${needsConfirmation} suggestion${needsConfirmation === 1 ? '' : 's'} below.`
            : needsChoice
              ? `Choose between ${needsChoice} conflicting value${needsChoice === 1 ? '' : 's'} below.`
            : fillResult?.failed > 0
              ? `Could not verify ${fillResult.failed} field${fillResult.failed === 1 ? '' : 's'}; please check the form.`
              : fillResult?.alreadyFilled > 0
                ? 'Existing answers were kept; no changes were needed.'
            : 'No matching information was found for the empty fields.',
      );
      const nextStep = Array.isArray(result.availableActions)
        ? result.availableActions.find((action: any) =>
          !action.disabled &&
          /\b(next|continue|proceed)\b/i.test(action.label) &&
          !/\bsubmit\b/i.test(action.label),
        )
        : undefined;
      if (nextStep && !mappings.some((field) =>
        field.decision === 'ask_user' || field.decision === 'review',
      )) {
        setStatusFeedback((current) =>
          `${current || ''} ${result.currentStep ? `Current step: ${result.currentStep}. ` : ''}` +
          `Review this step, then use the page's "${nextStep.label}" control and run Fill form again.`,
        );
      }
    } catch (error) {
      setStatusFeedback(
        error instanceof Error ? error.message : 'Form mapping failed.',
      );
    } finally {
      setMappingForm(false);
    }
  };

  const handleSaveFormAnswer = async (fieldId: string) => {
    if (!formSessionId || !selectedLibraryId) {
      setStatusFeedback('Run Fill form first to start a secure form session.');
      return;
    }
    const value = fieldAnswers[fieldId];
    if (!value?.trim()) {
      setStatusFeedback('Enter or select an answer first.');
      return;
    }
    try {
      const result: any = await browser.runtime.sendMessage({
        type: 'RESOLVE_FORM_FIELD',
        libraryId: selectedLibraryId,
        sessionId: formSessionId,
        fieldId,
        value: value.trim(),
      });
      if (!result?.success) throw new Error(result?.error || 'Could not save this answer.');
      setSavedAnswerIds((current) => [...new Set([...current, fieldId])]);
      setStatusFeedback('Answer saved for this form session. Run Fill form again to continue.');
    } catch (error) {
      setStatusFeedback(error instanceof Error ? error.message : 'Could not save this answer.');
    }
  };

  const handleFillConfirmedMappings = async () => {
    const confirmed = mappingResults.filter(
      (field) =>
        field.status === 'mapped' &&
        field.requiresConfirmation &&
        confirmedMappingIds.includes(field.fieldId),
    );
    const selectedChoices = mappingResults.flatMap((field) => {
      const choiceIndex = choiceSelections[field.fieldId];
      const choice = field.status === 'ambiguous' && choiceIndex !== undefined
        ? field.choices?.[choiceIndex]
        : undefined;
      return choice
        ? [{
            ...field,
            status: 'mapped' as const,
            source: choice.source,
            value: choice.value,
            confidence: choice.confidence,
            requiresConfirmation: true,
          }]
        : [];
    });
    const fields = [...confirmed, ...selectedChoices];
    if (fields.length === 0) {
      setStatusFeedback('Select the suggested values you want to fill.');
      return;
    }

    setAutofilling(true);
    try {
      const result: any = await browser.runtime.sendMessage({
        type: 'AUTOFILL_MAPPED_FIELDS',
        fields,
        confirmedFieldIds: [
          ...confirmedMappingIds,
          ...selectedChoices.map((field) => field.fieldId),
        ],
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Could not fill the confirmed values.');
      }
      setStatusFeedback(
        `Filled ${result.verified || 0} field${result.verified === 1 ? '' : 's'}.`,
      );
      setFillDiagnostics({
        attempted: result.attempted || 0,
        located: result.located || 0,
        accepted: result.accepted || 0,
        successful: result.successful || 0,
        verified: result.verified || 0,
        failed: result.failed || 0,
        requiresConfirmation: result.requiresConfirmation || 0,
        requiresUserAction: result.requiresUserAction || 0,
      });
      const filledIds = new Set(
        Array.isArray(result.results)
          ? result.results.filter((item: any) => item.status === 'verified').map((item: any) => item.fieldId)
          : [],
      );
      setMappingResults((current) =>
        current.filter((field) => !filledIds.has(field.fieldId)),
      );
      setConfirmedMappingIds([]);
    } catch (error) {
      setStatusFeedback(
        error instanceof Error ? error.message : 'Could not fill the confirmed values.',
      );
    } finally {
      setAutofilling(false);
    }
  };

  const handleUploadDoc = async () => {
    if (!selectedDocId) {
      setStatusFeedback('No document selected.');
      return;
    }
    const selectedLib = libraries.find((l) => l._id === selectedLibraryId);
    const targetDoc = selectedLib?.documents.find(
      (d) => d.documentId === selectedDocId
    );
    if (!targetDoc) return;

    setUploadingDoc(true);
    setStatusFeedback(null);
    try {
      const res: any = await browser.runtime.sendMessage({
        type: 'UPLOAD_DOC_TO_TAB',
        documentId: targetDoc.documentId,
        fileName:
          targetDoc.fileName || `${targetDoc.documentType || 'document'}.pdf`,
      });
      if (res?.success) {
        setStatusFeedback(
          `✓ Attached ${targetDoc.documentType || 'document'} to form upload field!`
        );
      } else {
        setStatusFeedback(res?.error || 'Could not attach document.');
      }
    } catch (err: any) {
      setStatusFeedback(err?.message || 'Document attachment failed.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const currentLib = libraries.find((l) => l._id === selectedLibraryId);
  const fileInputFields =
    pageSummary?.fields.filter((f) => f.type === 'file') || [];

  return (
    <main className={`auth-shell auth-shell--${layout}`}>
      <header className="brand-header">
        <div className="brand-mark" aria-hidden="true">
          F
        </div>
        <span>FebRocket</span>
      </header>

      <section
        className={`welcome-card ${auth.status === 'authenticated' ? 'welcome-card--compact' : ''}`}
        aria-live="polite"
      >
        {auth.status === 'loading' && (
          <div className="state-message" role="status">
            <span className="loader" aria-hidden="true" />
            Checking your session…
          </div>
        )}

        {auth.status === 'error' && (
          <div className="state-message state-message--error" role="alert">
            <p>{auth.error || 'We could not check your account.'}</p>
            <button
              className="text-button"
              onClick={() => sendAction('refresh')}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {(auth.status === 'unauthenticated' ||
          auth.status === 'session-expired') && (
          <>
            <p className="description">
              {auth.status === 'session-expired'
                ? 'Your FebRocket session has expired. Sign in on the FebRocket website to reconnect.'
                : 'Sign in to fill website forms with your saved information.'}
            </p>
            <button
              className="primary-button"
              onClick={() => sendAction('open-login')}
              type="button"
            >
              Login to FebRocket
              <span aria-hidden="true">→</span>
            </button>
          </>
        )}

        {auth.status === 'authenticated' && (
          <h1>Fill this page</h1>
        )}
      </section>

      {auth.status === 'authenticated' && (
        <section className="assistant-card">
          <div className="page-status-badge" aria-live="polite">
            {pageSummary ? (
              <span>
                {pageSummary.totalFields > 0
                  ? `${pageSummary.totalFields} form field${pageSummary.totalFields === 1 ? '' : 's'} found`
                  : 'No form fields found yet'}
              </span>
            ) : (
              <span>{scanning ? 'Checking this page…' : 'Ready to fill this page'}</span>
            )}
          </div>

          {libraries.length > 0 ? (
            <div className="profile-selector-group">
              <label htmlFor="profile-select">Your information</label>
              <select
                id="profile-select"
                value={selectedLibraryId}
                onChange={(e) => {
                  setSelectedLibraryId(e.target.value);
                  setMappingResults([]);
                  setConfirmedMappingIds([]);
                  setChoiceSelections({});
                }}
                className="select-input"
              >
                {libraries.map((lib) => (
                  <option key={lib._id} value={lib._id}>
                    {lib.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="no-docs-hint">
              Add a document to get started.{' '}
              <button
                className="inline-link"
                onClick={() => sendAction('open-app')}
                type="button"
              >
                Add document
              </button>
            </p>
          )}

          {statusFeedback && (
            <div
              className={`feedback-msg ${
                statusFeedback.startsWith('✓') ||
                statusFeedback.startsWith('Filled ')
                  ? 'feedback-success'
                  : statusFeedback.startsWith('Looking ')
                    ? 'feedback-progress'
                    : 'feedback-warn'
              }`}
            >
              {statusFeedback}
            </div>
          )}

          <div className="action-button-group">
            {libraries.length > 0 && (
              <button
                className="primary-button fill-btn"
                onClick={handleFormMapping}
                disabled={mappingForm || autofilling || !selectedLibraryId}
                type="button"
              >
                {mappingForm ? 'Filling your form…' : 'Fill form'}
              </button>
            )}

            {mappingResults.some(
              (field) =>
                (field.status === 'mapped' &&
                  field.requiresConfirmation &&
                  field.value !== null) ||
                (field.status === 'ambiguous' && Boolean(field.choices?.length)),
            ) && (
              <section className="mapping-results" aria-label="AI form-mapping results">
                <h4>Review suggestions</h4>
                <ul>
                  {mappingResults
                    .filter(
                      (field) =>
                        (field.status === 'mapped' &&
                          field.requiresConfirmation &&
                          field.value !== null) ||
                        (field.status === 'ambiguous' && Boolean(field.choices?.length)),
                    )
                    .map((field) => {
                      const label =
                        pageSummary?.fields.find((item) => item.fieldId === field.fieldId)?.label ||
                        field.fieldId;
                      return (
                        <li key={field.fieldId}>
                          <strong>{label}</strong>
                          {field.status === 'ambiguous' && field.choices?.length ? (
                            <fieldset>
                              <legend>{field.reason || 'Choose the correct source value'}</legend>
                              {field.choices.map((choice, index) => (
                                <label key={`${field.fieldId}-${choice.source}-${index}`}>
                                  <input
                                    type="radio"
                                    name={`choice-${field.fieldId}`}
                                    checked={choiceSelections[field.fieldId] === index}
                                    onChange={() => setChoiceSelections((current) => ({
                                      ...current,
                                      [field.fieldId]: index,
                                    }))}
                                  />
                                  <span>{String(choice.value)} ({choice.documentType})</span>
                                </label>
                              ))}
                            </fieldset>
                          ) : (
                            <label>
                              <input
                                type="checkbox"
                                checked={confirmedMappingIds.includes(field.fieldId)}
                                onChange={(event) => {
                                  setConfirmedMappingIds((current) =>
                                    event.target.checked
                                      ? [...current, field.fieldId]
                                      : current.filter((id) => id !== field.fieldId),
                                  );
                                }}
                              />
                              <span>{` — ${String(field.value)}`}</span>
                            </label>
                          )}
                        </li>
                      );
                    })}
                </ul>
                <button
                  className="secondary-btn"
                  onClick={handleFillConfirmedMappings}
                  disabled={autofilling || (confirmedMappingIds.length === 0 && Object.keys(choiceSelections).length === 0)}
                  type="button"
                >
                  {autofilling ? 'Filling…' : 'Fill selected'}
                </button>
              </section>
            )}

            {mappingResults.some((field) =>
              field.decision === 'review' ||
              (field.decision === 'ask_user' &&
                !(field.status === 'ambiguous' && Boolean(field.choices?.length)) &&
                !(field.status === 'mapped' && field.requiresConfirmation)),
            ) && (
              <section className="mapping-results" aria-label="Fields needing your input">
                <h4>Complete or review these fields</h4>
                <ul>
                  {mappingResults
                    .filter((field) =>
                      field.decision === 'review' ||
                      (field.decision === 'ask_user' &&
                        !(field.status === 'ambiguous' && Boolean(field.choices?.length)) &&
                        !(field.status === 'mapped' && field.requiresConfirmation)),
                    )
                    .map((field) => {
                      const label =
                        pageSummary?.fields.find((item) => item.fieldId === field.fieldId)?.label ||
                        field.fieldId;
                      return (
                        <li key={field.fieldId}>
                          <strong>{label}</strong>
                          <span>{` — ${field.decision === 'review' ? 'Please review and answer this yourself.' : field.action.question || 'Information is needed from you.'}`}</span>
                          {field.action.reason && <p>{field.action.reason}</p>}
                          {field.decision === 'ask_user' && (
                            <div className="form-answer">
                              {['select', 'radio', 'combobox'].includes(
                                pageSummary?.fields.find((item) => item.fieldId === field.fieldId)?.type,
                              ) && pageSummary?.fields.find((item) => item.fieldId === field.fieldId)?.options?.length ? (
                                <select
                                  aria-label={`Answer for ${label}`}
                                  value={fieldAnswers[field.fieldId] || ''}
                                  onChange={(event) => setFieldAnswers((current) => ({
                                    ...current,
                                    [field.fieldId]: event.target.value,
                                  }))}
                                >
                                  <option value="">Choose an answer</option>
                                  {pageSummary.fields
                                    .find((item) => item.fieldId === field.fieldId)
                                    .options.map((option: string) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  aria-label={`Answer for ${label}`}
                                  value={fieldAnswers[field.fieldId] || ''}
                                  onChange={(event) => setFieldAnswers((current) => ({
                                    ...current,
                                    [field.fieldId]: event.target.value,
                                  }))}
                                  maxLength={500}
                                />
                              )}
                              <button
                                className="secondary-btn"
                                onClick={() => void handleSaveFormAnswer(field.fieldId)}
                                disabled={savedAnswerIds.includes(field.fieldId)}
                                type="button"
                              >
                                {savedAnswerIds.includes(field.fieldId) ? 'Saved' : 'Save answer'}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}

            {import.meta.env.DEV && (mappingDiagnostics || fillDiagnostics) && (
              <details className="mapping-results">
                <summary>Developer diagnostics</summary>
                <dl>
                  {Object.entries({
                    ...mappingDiagnostics,
                    ...fillDiagnostics,
                  }).map(([name, value]) => (
                    <Fragment key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </details>
            )}

            {currentLib &&
              currentLib.documents &&
              currentLib.documents.length > 0 &&
              fileInputFields.length > 0 && (
                <details className="doc-attach-group">
                  <summary>Attach a document</summary>
                  <div className="attach-row">
                    <select
                      id="doc-select"
                      aria-label="Choose a document to attach"
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="select-input select-doc"
                    >
                      {currentLib.documents.map((doc) => (
                        <option key={doc.documentId} value={doc.documentId}>
                          {doc.documentType || 'Document'}
                        </option>
                      ))}
                    </select>
                    <button
                      className="secondary-btn attach-btn"
                      onClick={handleUploadDoc}
                      disabled={uploadingDoc || !selectedDocId}
                      type="button"
                    >
                      {uploadingDoc ? 'Attaching…' : 'Attach'}
                    </button>
                  </div>
                </details>
              )}
          </div>

        </section>
      )}

    </main>
  );
}
