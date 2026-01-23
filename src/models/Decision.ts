import mongoose, { Schema, Document } from 'mongoose';
import { IDecision, DecisionStatus, DecisionType } from '../types';

export interface IDecisionDocument extends Omit<IDecision, '_id' | 'annotatedPdfDocumentId'>, Document {
  annotatedPdfDocumentId?: mongoose.Types.ObjectId;
}

const DecisionSchema = new Schema<IDecisionDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    } as any,
    type: {
      type: String,
      enum: Object.values(DecisionType),
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    summary: {
      type: String,
      trim: true
    },
    content: {
      type: String,
      trim: true
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      index: true
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      index: true
    },
    discussionSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'DiscussionSession',
      index: true
    },
    closesDiscussion: {
      type: Boolean,
      default: false
    },
    closesCase: {
      type: Boolean,
      default: false,
      index: true
    },
    publishedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: Object.values(DecisionStatus),
      default: DecisionStatus.DRAFT,
      index: true
    },
    // Legal Requirement #12: Deletion is not text deletion but controlled system action (soft delete)
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    // Legal Requirement #14: Signed decision can only be revoked by "revoking decision"
    revokingDecisionId: {
      type: Schema.Types.ObjectId,
      ref: 'Decision',
      index: true
      // Reference to the decision that revoked this one (if applicable)
    },
    revokedByDecisionId: {
      type: Schema.Types.ObjectId,
      ref: 'Decision',
      index: true
      // Reference to the decision that was revoked by this one (if this is a revoking decision)
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    } as any,
    annotatedPdfDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
DecisionSchema.index({ caseId: 1, createdAt: -1 });
DecisionSchema.index({ caseId: 1, status: 1 });
DecisionSchema.index({ createdBy: 1 });
DecisionSchema.index({ isDeleted: 1, caseId: 1 });

// Legal Requirement #14: Signed decision cannot be edited, only revoked
DecisionSchema.pre('save', function(next) {
  const doc = this as IDecisionDocument;
  // If decision is signed, prevent content changes
  if (doc.status === DecisionStatus.SIGNED && doc.isModified('content') && !doc.isNew) {
    return next(new Error('החלטה חתומה אינה ניתנת לעריכה. לביטול יש ליצור "החלטה מבטלת".'));
  }
  
  // If decision is signed, prevent title changes
  if (doc.status === DecisionStatus.SIGNED && doc.isModified('title') && !doc.isNew) {
    return next(new Error('החלטה חתומה אינה ניתנת לעריכה. לביטול יש ליצור "החלטה מבטלת".'));
  }
  
  next();
});

export const Decision = mongoose.model<IDecisionDocument>('Decision', DecisionSchema);

