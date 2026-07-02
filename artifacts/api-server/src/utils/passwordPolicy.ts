export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 6 || password.length > 15) {
    return { valid: false, message: 'Password must be between 6 and 15 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must include at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one special character.' };
  }
  return { valid: true };
}
