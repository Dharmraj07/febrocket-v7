import type { AuthMessage, AuthState, AuthUser } from '../utils/auth';

const apiBaseUrl = (
  import.meta.env.WXT_API_BASE_URL ||
  'http://localhost:8080'
).replace(/\/+$/, '');
const frontendBaseUrl = (
  import.meta.env.WXT_FRONTEND_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

let authState: AuthState = {
  status: 'loading',
  user: null,
  error: null,
};
let pendingRefresh: Promise<void> | null = null;
const clients = new Set<Browser.runtime.Port>();

function publishAuthState(state: AuthState) {
  authState = state;
  for (const client of clients) {
    try {
      client.postMessage({ type: 'auth-state', state } satisfies AuthMessage);
    } catch (error) {
      console.error('Failed to notify an extension page about auth state:', error);
      clients.delete(client);
    }
  }
}

async function request(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
) {
  return fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function sendTabMessage(tabId: number, message: unknown) {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (messageError) {
    const messageText = String(messageError).toLowerCase();
    if (
      !messageText.includes('receiving end does not exist') &&
      !messageText.includes('could not establish connection')
    ) {
      throw messageError;
    }

    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['/content-scripts/content.js'],
      });
    } catch (error) {
      console.error('Could not inject the form scanner into the active tab:', error);
      throw new Error(
        'FebRocket cannot access this page. Allow site access for the extension, then reload the page and try again.',
      );
    }

    try {
      return await browser.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error('The form scanner did not respond after injection:', error);
      throw new Error('The page scanner could not start. Reload the page and try again.');
    }
  }
}

function isAuthUser(user: unknown): user is AuthUser {
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    'email' in user &&
    typeof user.email === 'string' &&
    user.email.length > 0 &&
    'userName' in user &&
    typeof user.userName === 'string' &&
    'role' in user &&
    (user.role === 'user' || user.role === 'admin' || user.role === 'business') &&
    (!('profilePicture' in user) ||
      user.profilePicture === null ||
      typeof user.profilePicture === 'string')
  );
}

async function refreshAuthState({ clearIdentity = false } = {}) {
  if (pendingRefresh) return pendingRefresh;

  const hadAuthenticatedSession = authState.status === 'authenticated';
  pendingRefresh = (async () => {
    if (clearIdentity || authState.status !== 'authenticated') {
      publishAuthState({ status: 'loading', user: null, error: null });
    }

    try {
      let response = await request('/api/auth/me');

      if (response.status === 401) {
        const refreshResponse = await request('/api/auth/refresh', 'POST');
        if (refreshResponse.status === 401) {
          publishAuthState({
            status: hadAuthenticatedSession ? 'session-expired' : 'unauthenticated',
            user: null,
            error: null,
          });
          return;
        }
        if (!refreshResponse.ok) {
          throw new Error(`Session refresh failed (${refreshResponse.status}).`);
        }

        response = await request('/api/auth/me');
      }

      if (response.status === 401) {
        publishAuthState({
          status: hadAuthenticatedSession ? 'session-expired' : 'unauthenticated',
          user: null,
          error: null,
        });
        return;
      }
      if (!response.ok) {
        throw new Error(`Authentication check failed (${response.status}).`);
      }

      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('user' in result) ||
        !isAuthUser(result.user)
      ) {
        throw new Error('The authentication response did not include a user.');
      }

      publishAuthState({
        status: 'authenticated',
        user: result.user,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to check your FebRocket session.';
      console.error('FebRocket authentication check failed:', error);
      publishAuthState({ status: 'error', user: null, error: message });
    }
  })().finally(() => {
    pendingRefresh = null;
  });

  return pendingRefresh;
}

export default defineBackground(() => {
  // Listen for long-lived port connections from popup and sidepanel
  browser.runtime.onConnect.addListener((client) => {
    if (client.name !== 'febrocket-auth') return;
    clients.add(client);
    void refreshAuthState({ clearIdentity: true });

    client.onMessage.addListener((message: AuthMessage) => {
      if (message.type === 'refresh') {
        void refreshAuthState();
      } else if (message.type === 'open-login') {
        void browser.tabs.create({ url: `${frontendBaseUrl}/` }).catch((error) => {
          console.error('Failed to open the FebRocket login page:', error);
        });
      } else if (message.type === 'open-app') {
        void browser.tabs.create({ url: `${frontendBaseUrl}/dashboard` }).catch((error) => {
          console.error('Failed to open FebRocket:', error);
        });
      }
    });

    client.onDisconnect.addListener(() => clients.delete(client));
  });

  // Listen for one-off messaging requests (Library fetching, tab scan, tab autofill, doc upload)
  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message.type === 'FETCH_LIBRARIES') {
      request('/api/document-library')
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          sendResponse({ success: true, libraries: data.libraries || [] });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep message channel open for async response
    }

    if (message.type === 'page-forms-updated' && message.summary) {
      for (const client of clients) {
        try {
          client.postMessage({ type: 'page-forms-updated', summary: message.summary });
        } catch (error) {
          console.error('Failed to notify the extension UI about page fields:', error);
          clients.delete(client);
        }
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SCAN_ACTIVE_TAB') {
      (async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            return sendResponse({ success: false, error: 'No active tab found' });
          }
          if (!tab.url || !/^https?:\/\//u.test(tab.url)) {
            return sendResponse({
              success: false,
              error: 'This page cannot be scanned. Open a regular website and try again.',
            });
          }
          const response = await sendTabMessage(tab.id, { type: 'detect-forms' });
          sendResponse(response);
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to scan this page.',
          });
        }
      })();
      return true;
    }

    if (message.type === 'RESOLVE_FORM_FIELD') {
      (async () => {
        try {
          if (
            typeof message.libraryId !== 'string' ||
            typeof message.sessionId !== 'string' ||
            typeof message.fieldId !== 'string' ||
            typeof message.value !== 'string'
          ) {
            return sendResponse({ success: false, error: 'A valid form answer is required.' });
          }
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) return sendResponse({ success: false, error: 'No active form page found.' });
          const pageUrl = new URL(tab.url);
          const response = await request('/api/forms/resolve', 'POST', {
            libraryId: message.libraryId,
            sessionId: message.sessionId,
            url: `${pageUrl.origin}${pageUrl.pathname}`.slice(0, 2048),
            fieldId: message.fieldId,
            value: message.value,
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(result?.message || `Could not save this answer (HTTP ${response.status}).`);
          }
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Could not save this answer.',
          });
        }
      })();
      return true;
    }

    if (message.type === 'MAP_FORM_ACTIVE_TAB') {
      (async () => {
        try {
          if (typeof message.libraryId !== 'string' || !message.libraryId) {
            return sendResponse({ success: false, error: 'Select a person profile first.' });
          }
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id || !tab.url) {
            return sendResponse({ success: false, error: 'No supported active page found.' });
          }
          const pageUrl = new URL(tab.url);
          if (!['http:', 'https:'].includes(pageUrl.protocol)) {
            return sendResponse({ success: false, error: 'Form mapping is unavailable on this page.' });
          }

          const scan = await sendTabMessage(tab.id, { type: 'detect-forms' });
          if (!scan?.success || !Array.isArray(scan.summary?.fields)) {
            return sendResponse({ success: false, error: 'Could not detect fields on this page.' });
          }

          const supportedTypes = new Set([
            'text',
            'search',
            'url',
            'date',
            'datetime-local',
            'email',
            'number',
            'tel',
            'textarea',
            'select',
            'multiselect',
            'radio',
            'checkbox',
            'combobox',
            'file',
          ]);
          const scannedFields = scan.summary.fields as any[];
          const selectedCountries = [...new Set(scannedFields
            .filter((field) =>
              /\bcountry\b/i.test([
                field.label,
                field.name,
                field.id,
                field.ariaLabel,
              ].join(' ')) &&
              !/\bcountry\s*code\b/i.test([
                field.label,
                field.name,
                field.id,
                field.ariaLabel,
              ].join(' ')) &&
              typeof field.currentValue === 'string' &&
              field.currentValue.trim() !== '' &&
              field.empty !== true,
            )
            .map((field) => String(field.selectedOption || field.currentValue).trim())
            .filter(Boolean))];
          const isEmpty = (field: any) => {
            if (field.currentValue === null || field.currentValue === undefined) return true;
            if (field.type === 'checkbox' || field.type === 'radio') {
              return field.currentValue === '' || field.currentValue === 'false' || field.currentValue === false;
            }
            return field.empty === true ||
              (typeof field.currentValue === 'string' && field.currentValue.trim() === '');
          };
          const getMappingFields = (summary: any, completed: Set<string>) =>
            (summary.fields as any[])
            .filter((field) => !field.sensitive)
            .filter((field) =>
              supportedTypes.has(field.type) &&
              typeof field.fieldId === 'string' &&
              !field.disabled &&
              !(field.readOnly && field.type !== 'date') &&
              !completed.has(field.fieldId) &&
              !field.userEdited &&
              isEmpty(field),
            )
            .map((field: any) => ({
              fieldId: field.fieldId,
              id: String(field.id || '').slice(0, 200),
              name: String(field.name || '').slice(0, 200),
              title: String(field.title || '').slice(0, 200),
              label: String(field.label || field.name || field.id || 'Unlabeled field').slice(0, 200),
              type: field.type,
              placeholder: String(field.placeholder || '').slice(0, 200),
              autocomplete: String(field.autocomplete || '').slice(0, 200),
              tagName: String(field.tagName || '').slice(0, 200),
              role: String(field.role || '').slice(0, 200),
              ariaLabel: String(field.ariaLabel || '').slice(0, 200),
              section: String(field.section || '').slice(0, 200),
              nearbyText: String(field.nearbyText || '').slice(0, 200),
              formId: String(field.formId || '').slice(0, 200),
              groupId: String(field.groupId || '').slice(0, 200),
              order: Number.isInteger(field.order) ? field.order : 0,
              readOnly: Boolean(field.readOnly),
              disabled: Boolean(field.disabled),
              visible: Boolean(field.visible),
              validationMessage: String(field.validationMessage || '').slice(0, 200),
              describedBy: String(field.describedBy || '').slice(0, 200),
              uploadAccept: String(field.uploadAccept || '').slice(0, 200),
              uploadMultiple: Boolean(field.uploadMultiple),
              required: Boolean(field.required),
              options: Array.isArray(field.options) ? field.options.slice(0, 100) : [],
            }));
          const fields = getMappingFields(scan.summary, new Set());
          const skippedField = (field: any) => {
            const decision = field.sensitive ? 'review' : 'skip';
            const reason = field.sensitive
              ? 'This sensitive or security-related field must be handled directly by you.'
              : field.disabled
                ? 'This field is disabled on the current page.'
                : field.userEdited || !isEmpty(field)
                  ? 'Existing or user-entered value was preserved.'
                  : 'This field type is not supported for automatic entry.';
            return {
              fieldId: field.fieldId,
              status: 'unsupported',
              decision,
              source: null,
              value: null,
              confidence: 0,
              reason,
              requiresConfirmation: decision === 'review',
              action: {
                type: decision,
                fieldId: field.fieldId,
                value: null,
                source: null,
                evidence: null,
                confidence: 0,
                reason,
              },
            };
          };
          const addNonActionableFields = (
            summary: any,
            results: Map<string, any>,
            completedFields: Set<string>,
          ) => {
            for (const field of summary.fields as any[]) {
              const eligible = supportedTypes.has(field.type) &&
                typeof field.fieldId === 'string' &&
                !field.disabled &&
                !(field.readOnly && field.type !== 'date') &&
                !field.userEdited &&
                isEmpty(field) &&
                !field.sensitive;
              if (!eligible && typeof field.fieldId === 'string' && !completedFields.has(field.fieldId)) {
                results.set(field.fieldId, skippedField(field));
              }
            }
          };
          const diagnostics = {
            detected: scannedFields.length,
            detectedControls: Number(scan.summary.detectedControls) || scannedFields.length,
            sent: fields.length,
            received: 0,
            mapped: 0,
            ambiguous: 0,
            missing: 0,
            unsupported: scannedFields.filter((field) => !supportedTypes.has(field.type) && !field.sensitive).length,
            alreadyFilled: scannedFields.filter((field) => !field.sensitive && !isEmpty(field)).length,
            preservedUserInput: scannedFields.filter((field) => field.userEdited).length,
            requiresConfirmation: 0,
            requiresUserAction: scannedFields.filter((field) => field.sensitive).length,
          };
          if (fields.length === 0) {
            const results = new Map<string, any>();
            addNonActionableFields(scan.summary, results, new Set());
            return sendResponse({
              success: true,
              fields: [...results.values()],
              diagnostics,
            });
          }

          const mappedFields: any[] = [];
          let mappingId: string | undefined;
          const countryContext = selectedCountries.length === 1 ? selectedCountries[0]?.slice(0, 100) || '' : '';
          const completed = new Set<string>();
          const executed = new Map<string, any>();
          const processed = new Map<string, any>();
          let currentSummary = scan.summary;
          let currentPlan: any[] = [];
          let planIndex = 0;
          let actionCount = 0;
          let requiresUserInput = false;
          addNonActionableFields(currentSummary, processed, completed);
          const maxActions = 20;
          const maxSessionMs = 90_000;
          const sessionStartedAt = Date.now();
          const pageSignature = (summary: any) => JSON.stringify(
            (summary.fields as any[]).map((field) => [
              field.fieldId,
              field.type,
              field.label,
              field.options,
              field.validationMessage,
            ]),
          );
          const sessionId = typeof message.sessionId === 'string' && message.sessionId.length <= 80
            ? message.sessionId
            : undefined;
          if (!sessionId) {
            const sessionResponse = await request('/api/forms/session', 'POST', {
              libraryId: message.libraryId,
              url: `${pageUrl.origin}${pageUrl.pathname}`.slice(0, 2048),
              title: String(tab.title || '').slice(0, 200),
            });
            const sessionResult = await sessionResponse.json().catch(() => null);
            if (!sessionResponse.ok || typeof sessionResult?.sessionId !== 'string') {
              throw new Error(sessionResult?.message || `Could not start a form session (HTTP ${sessionResponse.status}).`);
            }
            message.sessionId = sessionResult.sessionId;
          }
          const activeSessionId = message.sessionId as string;
          const feedback: Array<{ fieldId: string; status: string }> = [];

          while (actionCount < maxActions && Date.now() - sessionStartedAt < maxSessionMs) {
            if (planIndex >= currentPlan.length) {
              const nextFields = getMappingFields(currentSummary, completed);
              if (nextFields.length === 0) break;
              currentPlan = [];
              for (let offset = 0; offset < nextFields.length; offset += 80) {
                const response = await request('/api/forms/map', 'POST', {
                  libraryId: message.libraryId,
                  sessionId: activeSessionId,
                  website: {
                    url: `${pageUrl.origin}${pageUrl.pathname}`.slice(0, 2048),
                    title: String(tab.title || '').slice(0, 200),
                    language: String(currentSummary.pageLanguage || '').slice(0, 35),
                    country: countryContext,
                    currentStep: String(currentSummary.currentStep || '').slice(0, 200),
                    actions: Array.isArray(currentSummary.actions) ? currentSummary.actions.slice(0, 30) : [],
                  },
                  fields: nextFields.slice(offset, offset + 80),
                });
                const result = await response.json().catch(() => null);
                if (!response.ok) {
                  throw new Error(result?.message || `Form mapping failed (HTTP ${response.status}).`);
                }
                mappingId ||= typeof result.mappingId === 'string' ? result.mappingId : undefined;
                if (Array.isArray(result.fields)) {
                  currentPlan.push(...result.fields);
                  for (const mapped of result.fields) processed.set(mapped.fieldId, mapped);
                }
              }
              planIndex = 0;
              if (currentPlan.length === 0) break;
            }

            const mapping = currentPlan[planIndex++];
            if (mapping.decision === 'skip') continue;
            if (mapping.decision !== 'fill' || mapping.status !== 'mapped') {
              requiresUserInput = mapping.decision === 'ask_user' || mapping.decision === 'review';
              break;
            }
            const beforeSignature = pageSignature(currentSummary);
            let fillResponse: any;
            if (mapping.action.type === 'upload' && mapping.action.upload?.documentId) {
              const downloadResponse = await request(
                `/api/documents/${encodeURIComponent(mapping.action.upload.documentId)}/download`,
              );
              if (!downloadResponse.ok) {
                throw new Error(`Could not retrieve the matching document (HTTP ${downloadResponse.status}).`);
              }
              const download = await downloadResponse.json();
              if (typeof download.downloadUrl !== 'string') {
                throw new Error('Document-Service did not return a download link.');
              }
              const fileResponse = await fetch(download.downloadUrl);
              if (!fileResponse.ok) throw new Error('The matching document could not be downloaded.');
              const blob = await fileResponse.blob();
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let binary = '';
              for (const byte of bytes) binary += String.fromCharCode(byte);
              const extension = blob.type === 'application/pdf' ? 'pdf'
                : blob.type === 'image/png' ? 'png'
                  : blob.type === 'image/jpeg' ? 'jpg' : 'bin';
              fillResponse = await sendTabMessage(tab.id, {
                type: 'upload-file-request',
                fieldId: mapping.fieldId,
                fileDataUrl: `data:${blob.type || mapping.action.upload.fileType};base64,${btoa(binary)}`,
                fileName: `${mapping.action.upload.documentType || 'document'}.${extension}`,
              });
            } else {
              fillResponse = await sendTabMessage(tab.id, {
                type: 'autofill-mapped-request',
                fields: [mapping],
              });
            }
            const fillResult = mapping.action.type === 'upload'
              ? { status: fillResponse?.success ? 'verified' : 'upload_failed' }
              : fillResponse?.results?.find((result: any) => result.fieldId === mapping.fieldId);
            actionCount += 1;
            if (fillResult?.status !== 'verified') {
              feedback.push({ fieldId: mapping.fieldId, status: 'failed' });
              const failed = {
                ...mapping,
                decision: 'review',
                action: {
                  ...mapping.action,
                  type: 'review',
                  reason: 'The website did not accept or verify this value. Please inspect the field.',
                },
              };
              processed.set(mapping.fieldId, failed);
              const failedActionScan = await sendTabMessage(tab.id, { type: 'detect-forms' });
              if (failedActionScan?.success && Array.isArray(failedActionScan.summary?.fields)) {
                currentSummary = failedActionScan.summary;
              }
              requiresUserInput = true;
              break;
            }
            completed.add(mapping.fieldId);
            feedback.push({ fieldId: mapping.fieldId, status: 'filled' });
            executed.set(mapping.fieldId, { ...mapping, executed: true });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const updatedScan = await sendTabMessage(tab.id, { type: 'detect-forms' });
            if (!updatedScan?.success || !Array.isArray(updatedScan.summary?.fields)) {
              requiresUserInput = true;
              break;
            }
            currentSummary = updatedScan.summary;
            if (pageSignature(currentSummary) !== beforeSignature) {
              currentPlan = [];
              planIndex = 0;
              processed.clear();
              addNonActionableFields(currentSummary, processed, completed);
            }
          }
          if (actionCount >= maxActions || Date.now() - sessionStartedAt >= maxSessionMs) {
            requiresUserInput = true;
          }
          if (feedback.length > 0) {
            const feedbackResponse = await request('/api/forms/feedback', 'POST', {
              sessionId: activeSessionId,
              libraryId: message.libraryId,
              results: feedback,
            });
            if (!feedbackResponse.ok) {
              console.warn('Could not record form-session feedback:', feedbackResponse.status);
            }
          }
          mappedFields.push(...processed.values());
          for (const [fieldId, mapping] of executed) {
            const index = mappedFields.findIndex((field) => field.fieldId === fieldId);
            if (index >= 0) mappedFields[index] = mapping;
          }
          diagnostics.received = mappedFields.length;
          diagnostics.mapped = mappedFields.filter((field: any) => field.status === 'mapped').length;
          diagnostics.ambiguous = mappedFields.filter((field: any) => field.status === 'ambiguous').length;
          diagnostics.missing = mappedFields.filter((field: any) => field.status === 'missing').length;
          diagnostics.requiresConfirmation = mappedFields.filter((field: any) => field.requiresConfirmation).length;
          const fillDiagnostics = {
            attempted: actionCount,
            located: actionCount,
            accepted: actionCount,
            successful: executed.size,
            verified: executed.size,
            failed: actionCount - executed.size,
            requiresConfirmation: mappedFields.filter((field: any) => field.requiresConfirmation).length,
            requiresUserAction: mappedFields.filter((field: any) =>
              field.decision === 'ask_user' || field.decision === 'review',
            ).length,
          };
          sendResponse({
            success: true,
            mappingId,
            sessionId: activeSessionId,
            status: requiresUserInput ? 'needs_user' : completed.size > 0 ? 'continue' : 'complete',
            fields: mappedFields,
            diagnostics,
            fillDiagnostics,
            currentStep: currentSummary.currentStep || '',
            availableActions: currentSummary.actions || [],
          });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Form mapping failed.',
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTOFILL_MAPPED_FIELDS') {
      (async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            return sendResponse({ success: false, error: 'No active tab found.' });
          }
          const response = await sendTabMessage(tab.id, {
            type: 'autofill-mapped-request',
            fields: message.fields,
            confirmedFieldIds: message.confirmedFieldIds,
          });
          sendResponse(response);
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Could not fill mapped fields.',
          });
        }
      })();
      return true;
    }

    if (message.type === 'UPLOAD_DOC_TO_TAB') {
      (async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            return sendResponse({ success: false, error: 'No active tab found' });
          }
          const res = await request(`/api/documents/${message.documentId}/download`);
          if (!res.ok) throw new Error(`Failed to fetch document download link: HTTP ${res.status}`);
          const resData = await res.json();
          const downloadUrl = resData.downloadUrl;
          if (!downloadUrl) throw new Error('No download URL returned by server');

          const fileRes = await fetch(downloadUrl);
          const blob = await fileRes.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            const b = bytes[i];
            if (b !== undefined) binary += String.fromCharCode(b);
          }
          const base64 = btoa(binary);
          const fileDataUrl = `data:${blob.type || 'application/pdf'};base64,${base64}`;

          const response = await sendTabMessage(tab.id, {
            type: 'upload-file-request',
            selector: message.selector || 'input[type="file"]',
            fileDataUrl,
            fileName: message.fileName || 'document.pdf',
          });
          sendResponse(response);
        } catch (err: any) {
          sendResponse({ success: false, error: err.message || 'Failed to upload document' });
        }
      })();
      return true;
    }

    return false;
  });
});
