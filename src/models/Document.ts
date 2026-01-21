import mongoose, { Schema, Document } from 'mongoose';
import { IDocument, DocumentPermission, DocumentType } from '../types';

export interface IDocumentDocument extends IDocument, Document {}

const DocumentSchema = new Schema<IDocumentDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    permission: {
      type: String,
      enum: Object.values(DocumentPermission),
      required: true,
      default: DocumentPermission.ARBITRATOR_ONLY
    },
    visibleTo: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    version: {
      type: Number,
      default: 1
    },
    // Extended fields
    documentType: {
      type: String,
      enum: Object.values(DocumentType),
      index: true
    },
    belongsToProcedure: {
      type: String,
      trim: true
    },
    isLocked: {
      type: Boolean,
      default: false,
      index: true
    },
    isSecret: {
      type: Boolean,
      default: false,
      index: true
    },
    parentDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
DocumentSchema.index({ caseId: 1, createdAt: -1 });
DocumentSchema.index({ uploadedBy: 1 });

export const Document = mongoose.model<IDocumentDocument>('Document', DocumentSchema);

