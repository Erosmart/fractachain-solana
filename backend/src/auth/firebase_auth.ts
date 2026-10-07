import { upsertLogin } from './accounts';

export interface FirebaseProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

/**
 * Validates a Firebase ID token against Google's Identity Toolkit and returns
 * the profile Google vouches for. The client-sent uid/email are never trusted:
 * without this, anyone could POST an ADMIN_EMAILS address and get an admin
 * session. Only the public Web API key is needed (no service account).
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseProfile> {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_API_KEY no configurada en el backend');
  if (!idToken) throw new Error('Falta el idToken de Firebase');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    users?: { localId: string; email?: string; emailVerified?: boolean; displayName?: string; photoUrl?: string }[];
    error?: { message?: string };
  };
  const u = data.users?.[0];
  if (!res.ok || !u) throw new Error(`Token de Google inválido (${data.error?.message || res.status})`);
  if (!u.email) throw new Error('La cuenta de Google no tiene email');
  if (u.emailVerified === false) throw new Error('El email de Google no está verificado');
  return { uid: u.localId, email: u.email, displayName: u.displayName, photoURL: u.photoUrl };
}

/**
 * Resolves the profile to log in with. Production requires a verified token;
 * local dev without FIREBASE_API_KEY keeps the old trust-the-client behavior
 * so the test suite and offline work still run.
 */
export async function resolveFirebaseProfile(body: FirebaseProfile & { idToken?: string }): Promise<FirebaseProfile> {
  if (process.env.FIREBASE_API_KEY) return verifyFirebaseIdToken(String(body.idToken || ''));
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Login con Google deshabilitado: falta FIREBASE_API_KEY en el backend');
  }
  return body;
}

export function authenticateWithFirebase(payload: FirebaseProfile & { idToken?: string }) {
  const result = upsertLogin({
    uid: payload.uid,
    email: payload.email,
    name: payload.displayName,
    avatar: payload.photoURL,
  });
  return {
    success: true,
    user: result.user,
    token: result.token,
    message: 'Autenticación con Firebase completada',
  };
}

export function getFirebaseUserByToken(token?: string) {
  const { getAccountByToken, toPublic } = require('./accounts');
  const account = getAccountByToken(token);
  return account ? toPublic(account) : undefined;
}
