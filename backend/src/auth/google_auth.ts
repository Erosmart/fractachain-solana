// Fractachain Google OAuth Authentication Module

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  custodialWallet: string;
  kycStatus: 'UNREGISTERED' | 'PENDING' | 'APPROVED';
  authProvider: 'google';
  createdAt: string;
  lastLoginAt: string;
}

// In-memory user store
const usersByEmail = new Map<string, AuthUser>();
const sessions = new Map<string, AuthUser>();

// Preseed demo user
const DEMO_USER: AuthUser = {
  id: 'usr_google_104829104820',
  email: 'inversor@fractachain.com',
  name: 'Inversor Institucional',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop&crop=faces',
  custodialWallet: '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ',
  kycStatus: 'APPROVED',
  authProvider: 'google',
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};
usersByEmail.set(DEMO_USER.email, DEMO_USER);

export function authenticateWithGoogle(payload: {
  credential?: string;
  email?: string;
  name?: string;
  avatar?: string;
}): { success: boolean; user: AuthUser; token: string; message: string } {
  // If credential (JWT id_token) provided, in mock mode or decoded
  let email = payload.email;
  let name = payload.name;
  let avatar = payload.avatar;

  if (payload.credential) {
    try {
      // Decode JWT payload (base64url)
      const parts = payload.credential.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        email = email || decoded.email;
        name = name || decoded.name;
        avatar = avatar || decoded.picture;
      }
    } catch {
      // Graceful fallback
    }
  }

  // Default fallback for demo
  email = email || 'inversor@fractachain.com';
  name = name || 'Usuario de Google';
  avatar = avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&h=128&fit=crop';

  let user = usersByEmail.get(email.toLowerCase());
  const now = new Date().toISOString();

  if (!user) {
    user = {
      id: `usr_google_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: email.toLowerCase(),
      name,
      avatar,
      // Assign default testnet wallet or generate custodial address
      custodialWallet: '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ',
      kycStatus: 'APPROVED',
      authProvider: 'google',
      createdAt: now,
      lastLoginAt: now,
    };
    usersByEmail.set(email.toLowerCase(), user);
  } else {
    user.lastLoginAt = now;
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
  }

  // Generate session token
  const token = `fc_jwt_${Buffer.from(`${user.id}:${Date.now()}`).toString('base64')}`;
  sessions.set(token, user);

  return {
    success: true,
    user,
    token,
    message: 'Autenticación exitosa con Google',
  };
}

export function getUserByToken(token?: string): AuthUser | undefined {
  if (!token) return undefined;
  const cleanToken = token.replace(/^Bearer\s+/i, '');
  return sessions.get(cleanToken);
}

export function revokeSession(token?: string): boolean {
  if (!token) return false;
  const cleanToken = token.replace(/^Bearer\s+/i, '');
  return sessions.delete(cleanToken);
}
