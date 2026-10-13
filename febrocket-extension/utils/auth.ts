export interface AuthUser {
  id: string;
  email: string;
  userName: string;
  profilePicture?: string | null;
  role: string;
}

export interface AuthState {
  status:
    | 'loading'
    | 'authenticated'
    | 'unauthenticated'
    | 'session-expired'
    | 'error';
  user: AuthUser | null;
  error: string | null;
}

export type AuthMessage =
  | { type: 'auth-state'; state: AuthState }
  | { type: 'refresh' }
  | { type: 'open-login' }
  | { type: 'open-app' };

export function isAuthStateMessage(
  message: unknown,
): message is Extract<AuthMessage, { type: 'auth-state' }> {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'auth-state' &&
    'state' in message
  );
}
