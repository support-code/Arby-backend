import mongoose, { Schema, Document } from 'mongoose';
import { IProtocol } from '../types';

export interface IProtocolDocument extends IProtocol, Document {}

const ProtocolSchema = new Schema<IProtocolDocument>(
  {
    discussionSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'DiscussionSession',
      required: true,
      index: true
    },
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true // HTML content
    },
    version: {
      type: Number,
      required: true,
      default: 1
      // Incremental version number (never decreases) - Legal Principle #7: Versioning is append-only
    },
    isSigned: {
      type: Boolean,
      default: false
      // Whether this version was signed (immutable) - Legal Principle #7
    },
    isCurrentVersion: {
      type: Boolean,
      default: true,
      index: true
      // Legal Requirement #10: Only one current version exists at any time for public view
    },
    signedAt: {
      type: Date
      // Timestamp when signed - Legal Principle #10: Every write action is timestamped
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
      // User ID who signed - Legal Principle #10: Every state change is logged with userId
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
ProtocolSchema.index({ discussionSessionId: 1, version: -1 });
ProtocolSchema.index({ caseId: 1, createdAt: -1 });
ProtocolSchema.index({ isSigned: 1, signedAt: -1 });

// Legal Validation: Protocol versions are append-only and immutable after creation
ProtocolSchema.pre('save', function(next) {
  // Legal Principle #7: Versioning is append-only, original versions remain audit-visible
  if (!this.isNew && this.isModified('content')) {
    // Content cannot be modified after creation - only new versions allowed
    return next(new Error('פרוטוקול אינו ניתן לעריכה לאחר יצירה. יש ליצור גרסה חדשה.'));
  }

  // Ensure updatedAt matches createdAt for immutable records
  if (this.isNew) {
    this.updatedAt = this.createdAt || new Date();
  }

  next();
});

export const Protocol = mongoose.model<IProtocolDocument>('Protocol', ProtocolSchema);

