import i18n from './index';

const CODE_MAP: Record<string, string> = {
  NO_ACCOUNT: 'No account found. Please sign up first.',
  ACCOUNT_EXISTS: 'An account already exists. Please sign in.',
  ACCOUNT_BANNED: 'This account is disabled. Contact support.',
  EMAIL_VERIFICATION_REQUIRED: 'Verify your email to continue.'
};

const CODE_MAP_ES: Record<string, string> = {
  NO_ACCOUNT: 'No hay una cuenta asociada. Regístrate primero.',
  ACCOUNT_EXISTS: 'Ya existe una cuenta. Inicia sesión.',
  ACCOUNT_BANNED: 'Esta cuenta está inhabilitada. Contacta soporte.',
  EMAIL_VERIFICATION_REQUIRED: 'Verifica tu correo para continuar.'
};

export function mapAuthError(message: string): string {
  const code = Object.keys(CODE_MAP).find((key) => message.includes(key));
  if (!code) return message;
  return i18n.language.startsWith('en') ? CODE_MAP[code] : CODE_MAP_ES[code];
}
