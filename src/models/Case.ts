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
    arbitratorIds: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    }],
    // Deprecated - use caseParties and caseLawyers instead
    lawyers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    parties: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    caseParties: [{
      type: Schema.Types.ObjectId,
      ref: 'CaseParty'
    }],
    caseLawyers: [{
      type: Schema.Types.ObjectId,
      ref: 'CaseLawyer'
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
CaseSchema.index({ arbitratorIds: 1, status: 1 });
CaseSchema.index({ lawyers: 1 });
CaseSchema.index({ parties: 1 });
CaseSchema.index({ caseParties: 1 });
CaseSchema.index({ caseLawyers: 1 });

export const Case = mongoose.model<ICaseDocument>('Case', CaseSchema);

