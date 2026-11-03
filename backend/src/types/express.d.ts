import type { SessionUser } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}

export {};
