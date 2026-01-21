import mongoose, { Schema, Document } from 'mongoose';
import { ICase, CaseStatus, ConfidentialityLevel } from '../types';

export interface ICaseDocument extends Omit<ICase, '_id'>, Document {}

const CaseSchema = new Schema<ICaseDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    arbitratorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    } as any,
    lawyers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    parties: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    status: {
      type: String,
      enum: Object.values(CaseStatus),
      default: CaseStatus.DRAFT,
      index: true
    },
    closedAt: {
      type: Date
    },
    // Extended fields
    caseNumber: {
      type: String,
      trim: true,
      index: true
    },
    caseType: {
      type: String,
      trim: true
    },
    claimAmount: {
      type: Number
    },
    confidentialityLevel: {
      type: String,
      enum: Object.values(ConfidentialityLevel),
      default: ConfidentialityLevel.CONFIDENTIAL
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CaseSchema.index({ arbitratorId: 1, status: 1 });
CaseSchema.index({ lawyers: 1 });
CaseSchema.index({ parties: 1 });

export const Case = mongoose.model<ICaseDocument>('Case', CaseSchema);

