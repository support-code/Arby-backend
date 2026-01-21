import mongoose, { Schema, Document } from 'mongoose';
import { IRelatedCase, RelationType } from '../types';

export interface IRelatedCaseDocument extends Omit<IRelatedCase, '_id' | 'caseId' | 'relatedCaseId'>, Document {
  caseId: mongoose.Types.ObjectId;
  relatedCaseId: mongoose.Types.ObjectId;
}

const RelatedCaseSchema = new Schema<IRelatedCaseDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    relatedCaseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    relationType: {
      type: String,
      enum: Object.values(RelationType),
      required: true,
      index: true
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
RelatedCaseSchema.index({ caseId: 1 });
RelatedCaseSchema.index({ relatedCaseId: 1 });
RelatedCaseSchema.index({ caseId: 1, relatedCaseId: 1 }, { unique: true });

export const RelatedCase = mongoose.model<IRelatedCaseDocument>('RelatedCase', RelatedCaseSchema);

