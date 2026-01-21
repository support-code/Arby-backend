import { AuditLog } from '../models/AuditLog';
import { Request } from 'express';

export const logAction = async (
  userId: string,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>,
  req?: Request
): Promise<void> => {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: req?.ip || req?.socket.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('Audit log error:', error);
  }
};

