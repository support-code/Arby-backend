import mongoose, { Schema, Document } from 'mongoose';
import { IDiscussionSession } from '../types';

export interface IDiscussionSessionDocument extends IDiscussionSession, Document {}

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
  // Legal Principle #1 & #2: Protocol may ONLY be written during ACTIVE hearing with participants
  if (this.isModified('protocol') && this.protocol) {
    if (this.status !== 'active') {
      return next(new Error(`פרוטוקול ניתן לעריכה רק במהלך דיון פעיל (ACTIVE). סטטוס נוכחי: ${this.status}`));
    }
    if (!this.attendees || this.attendees.length === 0) {
      return next(new Error('לא ניתן לכתוב פרוטוקול ללא נוכחים רשומים. יש להוסיף לפחות נוכח אחד.'));
    }
  }

  // Legal Principle #6: When ending, create immutable snapshot
  if (this.isModified('status') && this.status === 'ended' && this.protocol) {
    this.protocolSnapshot = this.protocol;
  }

  // Legal Principle #7: When signing, mark as immutable
  if (this.isModified('status') && this.status === 'signed' && !this.signedAt) {
    this.signedAt = new Date();
    if (!this.protocolSnapshot && this.protocol) {
      this.protocolSnapshot = this.protocol;
    }
  }

  next();
});

export const DiscussionSession = mongoose.model<IDiscussionSessionDocument>('DiscussionSession', DiscussionSessionSchema);

