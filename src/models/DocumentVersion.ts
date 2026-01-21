import mongoose, { Schema, Document } from 'mongoose';
import { IDocumentVersion } from '../types';

export interface IDocumentVersionDocument extends Omit<IDocumentVersion, '_id' | 'documentId' | 'createdBy'>, Document {
  documentId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const DocumentVersionSchema = new Schema<IDocumentVersionDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true
    },
    version: {
      type: Number,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    changes: {
      type: String,
      trim: true
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
DocumentVersionSchema.index({ documentId: 1, version: -1 });
DocumentVersionSchema.index({ documentId: 1, createdAt: -1 });

export const DocumentVersion = mongoose.model<IDocumentVersionDocument>('DocumentVersion', DocumentVersionSchema);

