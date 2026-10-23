import { readFileSync } from 'node:fs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AccessDeniedError } from '../errors/access-denied.error.js';
import type { Role, Subject } from './subject.js';

const VALID_ROLES: Role[] = ['mahasiswa', 'dosen', 'admin', 'service'];

export type TokenVerifier = (token: string) => Subject;

export function createTokenVerifier(): TokenVerifier {
  const publicKey = readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
  const issuer = env.JWT_ISSUER;

  return (token: string): Subject => {
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer }) as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw AccessDeniedError.tokenExpired();
      throw AccessDeniedError.tokenInvalid();
    }
    const typ = decoded.typ;
    if (typ !== 'access' && typ !== 'service') throw AccessDeniedError.tokenInvalid();
    const sub = decoded.sub;
    const role = decoded.role as Role | undefined;
    if (typeof sub !== 'string' || !role || !VALID_ROLES.includes(role)) {
      throw AccessDeniedError.tokenInvalid();
    }
    if (role === 'service') {
      if (typ !== 'service') throw AccessDeniedError.tokenInvalid();
      return { type: 'service', id: sub, role: 'service' };
    }
    const id = Number.parseInt(sub, 10);
    if (!Number.isInteger(id)) throw AccessDeniedError.tokenInvalid();
    return { type: 'user', id, role };
  };
}
