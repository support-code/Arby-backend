import mongoose, { Schema, Document } from 'mongoose';
import { IHearing, HearingType, HearingStatus } from '../types';

export interface IHearingDocument extends IHearing, Document {}

const HearingSchema = new Schema<IHearingDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    scheduledDate: {
      type: Date,
      required: true,
      index: true
    },
    duration: {
      type: Number // in minutes
    },
    location: {
      type: String,
      trim: true
    },
    type: {
      type: String,
      enum: Object.values(HearingType),
      required: true,
      index: true
    },
    participants: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    notes: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(HearingStatus),
      default: HearingStatus.CREATED,
      index: true
      // Legal state machine: CREATED → ACTIVE → ENDED → SIGNED (one-way, no rollback)
    },
    signedAt: {
      type: Date,
      index: true
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
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
HearingSchema.index({ caseId: 1, scheduledDate: 1 });
HearingSchema.index({ scheduledDate: 1, status: 1 });
HearingSchema.index({ participants: 1 });

export const Hearing = mongoose.model<IHearingDocument>('Hearing', HearingSchema);

