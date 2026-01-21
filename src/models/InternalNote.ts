import mongoose, { Schema, Document } from 'mongoose';
import { IInternalNote } from '../types';

export interface IInternalNoteDocument extends Omit<IInternalNote, '_id' | 'caseId' | 'createdBy'>, Document {
  caseId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const InternalNoteSchema = new Schema<IInternalNoteDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tags: [{
      type: String,
      trim: true
    }]
  },
  {
    timestamps: true
  }
);

// Indexes
InternalNoteSchema.index({ caseId: 1, createdAt: -1 });
InternalNoteSchema.index({ createdBy: 1 });
InternalNoteSchema.index({ tags: 1 });

export const InternalNote = mongoose.model<IInternalNoteDocument>('InternalNote', InternalNoteSchema);

