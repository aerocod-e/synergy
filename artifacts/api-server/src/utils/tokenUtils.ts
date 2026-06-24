import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  role: string;
  entityType: string | null;
  entityId: string | null;
  firstName?: string;
  lastName?: string;
}

function getSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

export function generateTokens(
  userId: string,
  role: string,
  entityType: string | null,
  entityId: string | null,
  firstName = '',
  lastName = ''
): { accessToken: string; refreshToken: string } {
  const payload: TokenPayload = { userId, role, entityType, entityId, firstName, lastName };

  const accessToken = jwt.sign(payload, getSecret("JWT_SECRET"), {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(payload, getSecret("JWT_REFRESH_SECRET"), {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret("JWT_SECRET")) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret("JWT_REFRESH_SECRET")) as TokenPayload;
}
