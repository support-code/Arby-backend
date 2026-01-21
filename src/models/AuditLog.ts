import mongoose, { Schema, Document } from 'mongoose';
import { IAuditLog } from '../types';

export interface IAuditLogDocument extends Omit<IAuditLog, '_id'>, Document {}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    } as any,
    action: {
      type: String,
      required: true,
      index: true
    },
    resource: {
      type: String,
      required: true,
      index: true
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      index: true
    } as any,
    details: {
      type: Schema.Types.Mixed
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Indexes for querying
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);

