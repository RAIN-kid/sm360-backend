import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to include our custom user payload
export interface AuthRequest extends Request {
  user?: {
    userId: number;
    role: string;
    orgId: number;
  };
}

/**
 * Middleware: Verify JWT Token
 * Huyu ni mlinzi anayekagua kama mtumiaji ana kitambulisho halali cha kuingia.
 */
export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    // Check if the Authorization header exists and has the 'Bearer <token>' format
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ status: 'error', message: 'Njia imezuiwa. Tafadhali ingia (Login) kwanza.' });
      return;
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_sm360_key_2026') as any;

    // Attach the decoded user data to the request object so controllers can use it
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      orgId: decoded.orgId,
    };

    next(); // Pass control to the next function (the controller)
  } catch (error: any) {
    console.error('[AUTH_MIDDLEWARE_ERROR]:', error.message);
    res.status(401).json({ status: 'error', message: 'Muda wa kitambulisho chako umeisha au si halali.' });
  }
};

/**
 * Middleware: Authorize Roles
 * Huyu ni mlinzi anayekagua kama cheo chako kinaruhusiwa kufanya hili tendo.
 */
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        status: 'error', 
        message: 'Huna mamlaka (Permission) ya kufanya kitendo hiki.' 
      });
      return;
    }
    next();
  };
};