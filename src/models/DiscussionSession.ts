import mongoose, { Schema, Document } from 'mongoose';
import { IDiscussionSession } from '../types';

export interface IDiscussionSessionDocument extends Omit<IDiscussionSession, '_id' | 'hearingId' | 'caseId' | 'signedBy' | 'createdBy'>, Document {
  hearingId: mongoose.Types.ObjectId;
  caseId: mongoose.Types.ObjectId;
  signedBy?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const DiscussionSessionSchema = new Schema<IDiscussionSessionDocument>(
  {
    hearingId: {
      type: Schema.Types.ObjectId,
      ref: 'Hearing',
      required: true,
      index: true
    },
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    startedAt: {
      type: Date,
      required: true,
      index: true
    },
    endedAt: {
      type: Date,
      index: true
    },
    attendees: [{
      type: {
        type: String,
        enum: ['witness', 'expert', 'court_clerk', 'secretary', 'other'],
        required: true
      },
      name: {
        type: String,
        required: true,
        trim: true
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
      }
    }],
    protocol: {
      type: String // HTML content (read-only after ENDED/SIGNED, editable only when ACTIVE with participants)
    },
    decisions: [{
      type: Schema.Types.ObjectId,
      ref: 'Decision'
    }],
    status: {
      type: String,
      enum: ['created', 'active', 'ended', 'signed', 'completed', 'cancelled'], // Legal state machine: created → active → ended → signed
      default: 'created',
      index: true
    },
    signedAt: {
      type: Date,
      index: true
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    protocolSnapshot: {
      type: String // Final immutable snapshot when hearing ended (legal requirement)
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
DiscussionSessionSchema.index({ hearingId: 1, status: 1 });
DiscussionSessionSchema.index({ caseId: 1, startedAt: -1 });
DiscussionSessionSchema.index({ status: 1, startedAt: -1 });

// Legal Validation: Prevent protocol write when status is not ACTIVE or no participants
DiscussionSessionSchema.pre('save', function(next) {
  const doc = this as unknown as IDiscussionSessionDocument;
  // Legal Principle #1 & #2: Protocol may ONLY be written during ACTIVE hearing with participants
  if (doc.isModified('protocol') && doc.protocol) {
    if (doc.status !== 'active') {
      return next(new Error(`פרוטוקול ניתן לעריכה רק במהלך דיון פעיל (ACTIVE). סטטוס נוכחי: ${doc.status}`));
    }
    if (!doc.attendees || doc.attendees.length === 0) {
      return next(new Error('לא ניתן לכתוב פרוטוקול ללא נוכחים רשומים. יש להוסיף לפחות נוכח אחד.'));
    }
  }

  // Legal Principle #6: When ending, create immutable snapshot
  if (doc.isModified('status') && doc.status === 'ended' && doc.protocol) {
    doc.protocolSnapshot = doc.protocol;
  }

  // Legal Principle #7: When signing, mark as immutable
  if (doc.isModified('status') && doc.status === 'signed' && !doc.signedAt) {
    doc.signedAt = new Date();
    if (!doc.protocolSnapshot && doc.protocol) {
      doc.protocolSnapshot = doc.protocol;
    }
  }

  next();
});

export const DiscussionSession = mongoose.model<IDiscussionSessionDocument>('DiscussionSession', DiscussionSessionSchema);

