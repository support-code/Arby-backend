import mongoose, { Schema, Document } from 'mongoose';
import { IComment } from '../types';

export interface ICommentDocument extends Omit<IComment, '_id'>, Document {}

const CommentSchema = new Schema<ICommentDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    } as any,
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
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
    } as any,
    isInternal: {
      type: Boolean,
      default: false,
      index: true
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CommentSchema.index({ caseId: 1, createdAt: -1 });
CommentSchema.index({ documentId: 1 });
CommentSchema.index({ parentId: 1 });
CommentSchema.index({ isInternal: 1 });

export const Comment = mongoose.model<ICommentDocument>('Comment', CommentSchema);

