export enum UserRole {
  ADMIN = 'admin',
  ARBITRATOR = 'arbitrator',
  LAWYER = 'lawyer',
  PARTY = 'party',
  ASSISTANT = 'assistant' // עוזרת משפטית/מזכירה
}

export enum CaseStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PENDING_DECISION = 'pending_decision',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}

export enum DocumentPermission {
  ARBITRATOR_ONLY = 'arbitrator_only',
  ALL_PARTIES = 'all_parties',
  SPECIFIC_PARTY = 'specific_party',
  LAWYERS_ONLY = 'lawyers_only'
}

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  name: string;
  firstName?: string; // שם פרטי
  lastName?: string; // שם משפחה
  idNumber?: string; // ת.ז.
  address?: string; // כתובת
  phone?: string; // טלפון
  profession?: string; // מקצוע (גמיש - ניתן להוסיף)
  role: UserRole;
  status: 'active' | 'inactive' | 'pending';
  // Privacy: טלפון ומייל של בורר לא נראים לאחרים
  createdAt: Date;
  updatedAt: Date;
}

// Party status enum
export enum PartyStatus {
  PLAINTIFF = 'תובע',
  PLAINTIFF_FEMALE = 'תובעת',
  DEFENDANT = 'נתבע',
  DEFENDANT_FEMALE = 'נתבעת'
}

// Company model for legal entities
export interface ICompany {
  _id?: string;
  companyName: string; // שם התאגיד
  companyNumber: string; // מספר תאגיד
  address: string; // כתובת
  phone?: string; // טלפון
  email?: string; // דוא"ל
  status: PartyStatus; // תובע/תובעת/נתבע/נתבעת
  authorizedSignatories: IAuthorizedSignatory[]; // מורשי חתימה
  signatureDocumentReceived?: boolean; // האם התקבל מסמך מורשי חתימה
  createdAt: Date;
  updatedAt: Date;
}

// Authorized signatory for companies
export interface IAuthorizedSignatory {
  firstName: string; // שם פרטי
  lastName: string; // שם משפחה
  idNumber: string; // ת.ז.
  address?: string; // כתובת
  phone?: string; // טלפון
  email?: string; // דוא"ל
}

// Case Party - link between case and party (person or company)
export interface ICaseParty {
  _id?: string;
  caseId: string;
  // For person
  userId?: string; // User ID if it's a person
  // For company
  companyId?: string; // Company ID if it's a company
  isCompany: boolean; // האם זה חברה או אדם
  status: PartyStatus; // תובע/תובעת/נתבע/נתבעת
  // Person details (if not a company)
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Case Lawyer - link between case and lawyer with full details
export interface ICaseLawyer {
  _id?: string;
  caseId: string;
  userId?: string; // User ID if exists
  partyId: string; // Which party this lawyer represents (CaseParty ID)
  firstName: string;
  lastName: string;
  idNumber?: string;
  address?: string;
  phone?: string;
  email: string;
  profession: string; // מקצוע (ברירת מחדל: עורך דין, אבל יכול להיות כל דבר)
  status: string; // ב"כ תובע, ב"כ נתבע, etc.
  createdAt: Date;
  updatedAt: Date;
}

// Task Assignment - for assigning tasks to assistants/secretaries
export interface ITaskAssignment {
  _id?: string;
  caseId: string;
  taskId?: string; // Link to Task if exists
  assignedBy: string; // Arbitrator User ID
  assignedTo: string; // Assistant/Secretary User ID
  taskDescription: string; // תיאור המשימה
  taskType?: string; // סוג המשימה (טיוטת פסק, סיכום מסמכים, וכו')
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface ICase {
  _id?: string;
  title: string;
  description?: string;
  arbitratorIds: string[]; // Array of arbitrator User IDs (changed from arbitratorId)
  lawyers: string[]; // User IDs (deprecated - use caseLawyers instead)
  parties: string[]; // User IDs (deprecated - use caseParties instead)
  caseParties?: string[]; // CaseParty IDs
  caseLawyers?: string[]; // CaseLawyer IDs
  status: CaseStatus;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  // Extended fields
  caseNumber?: string; // Official case number
  caseType?: string; // Type of case
  claimAmount?: number; // Claim amount
  confidentialityLevel?: ConfidentialityLevel; // Confidentiality level
}

export interface IDocument {
  _id?: string;
  caseId: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string; // User ID
  permission: DocumentPermission;
  visibleTo?: string[]; // User IDs (if specific permission)
  version: number;
  createdAt: Date;
  updatedAt: Date;
  // Extended fields
  documentType?: DocumentType; // Type of document
  belongsToProcedure?: string; // Belongs to specific procedure
  isLocked?: boolean; // Locked for editing
  isSecret?: boolean; // Secret document
  parentDocumentId?: string; // For linked documents
}

export interface IInvitation {
  _id?: string;
  email: string;
  role: UserRole;
  caseId?: string; // Optional - for case-specific invitations
  invitedBy: string; // User ID
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

export interface IAuditLog {
  _id?: string;
  userId: string;
  action: string;
  resource: string; // 'case', 'document', 'user', etc.
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// New interfaces for advanced case management

export enum DecisionStatus {
  DRAFT = 'draft',
  SENT_FOR_SIGNATURE = 'sent_for_signature',
  SIGNED = 'signed'
  // Legal lifecycle: DRAFT → SENT_FOR_SIGNATURE → SIGNED (not editable after SIGNED)
}

export enum DecisionType {
  NOTE_DECISION = 'note_decision', // החלטה בפיתקית - על גבי בקשה
  FINAL_DECISION = 'final_decision', // החלטה סופית - סוגרת דיון
  DISCUSSION_DECISION = 'discussion_decision' // החלטה דיונית - נוצרת דרך דיונים
}

export interface IDecision {
  _id?: string;
  caseId: string;
  type: DecisionType;
  title: string;
  summary?: string;
  content?: string;
  documentId?: string; // Link to document
  requestId?: string; // For NOTE_DECISION - link to request
  discussionSessionId?: string; // For DISCUSSION_DECISION and FINAL_DECISION (Legal Requirement #13: Not time-bound)
  closesDiscussion?: boolean; // For FINAL_DECISION - indicates if this closes the discussion
  closesCase?: boolean; // For FINAL_DECISION - indicates if this closes the entire case
  annotatedPdfDocumentId?: string; // Link to annotated PDF document
  publishedAt?: Date;
  status: DecisionStatus;
  // Legal Requirement #12: Deletion is controlled system action (soft delete)
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  // Legal Requirement #14: Signed decision can only be revoked by "revoking decision"
  revokingDecisionId?: string; // Decision that revoked this one
  revokedByDecisionId?: string; // Decision that was revoked by this one
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum RequestType {
  INSTRUCTION = 'instruction',
  TEMPORARY_RELIEF = 'temporary_relief',
  AFTER_CLOSURE = 'after_closure',
  OTHER = 'other'
}

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  UNDER_REVIEW = 'under_review'
}

export interface IRequest {
  _id?: string;
  caseId: string;
  type: RequestType;
  title: string;
  content: string;
  status: RequestStatus;
  submittedBy: string;
  respondedBy?: string;
  responseDate?: Date;
  response?: string;
  attachments?: string[]; // Document IDs for attached PDFs
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment {
  _id?: string;
  caseId: string;
  documentId?: string; // Optional - for document-specific comments
  content: string;
  createdBy: string;
  isInternal: boolean; // For arbitrator only
  parentId?: string; // For nested comments
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface ITask {
  _id?: string;
  caseId: string;
  title: string;
  description?: string;
  assignedTo: string;
  dueDate?: Date;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum HearingType {
  PRELIMINARY = 'preliminary',
  MAIN = 'main',
  CLOSING = 'closing',
  OTHER = 'other'
}

export enum HearingStatus {
  CREATED = 'created',
  ACTIVE = 'active',
  ENDED = 'ended',
  SIGNED = 'signed'
  // Legal state machine: CREATED → ACTIVE → ENDED → SIGNED (one-way, no rollback)
}

export interface IHearing {
  _id?: string;
  caseId: string;
  scheduledDate: Date;
  duration?: number; // in minutes
  location?: string;
  type: HearingType;
  participants: string[]; // User IDs
  notes?: string;
  status: HearingStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum AttendeeType {
  WITNESS = 'witness', // עד
  EXPERT = 'expert', // מומחה
  COURT_CLERK = 'court_clerk', // יכל
  SECRETARY = 'secretary', // מנני
  OTHER = 'other' // אחר
}

export interface IAttendee {
  type: AttendeeType;
  name: string;
  userId?: string; // Optional user ID if it's a system user
}

export interface IDiscussionSession {
  _id?: string;
  hearingId: string;
  caseId: string;
  title: string;
  startedAt: Date;
  endedAt?: Date;
  signedAt?: Date; // Timestamp when protocol was signed (immutable after this)
  signedBy?: string; // User ID who signed
  attendees: IAttendee[]; // Array of attendee objects with type and name
  protocol?: string; // HTML content of the protocol (read-only after ENDED/SIGNED)
  protocolSnapshot?: string; // Final immutable snapshot when hearing ended
  decisions?: string[]; // Decision IDs (separate from protocol)
  status: 'created' | 'active' | 'ended' | 'signed' | 'completed' | 'cancelled'; // Maps to hearing status
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProtocol {
  _id?: string;
  discussionSessionId: string;
  caseId: string;
  content: string; // HTML content (append-only, immutable after creation)
  version: number; // Incremental version number (never decreases)
  isSigned: boolean; // Whether this version was signed (immutable)
  signedAt?: Date; // Timestamp when signed
  signedBy?: string; // User ID who signed
  isCurrentVersion?: boolean; // Legal Requirement #10: Only one current version exists at any time
  createdBy: string;
  createdAt: Date;
  updatedAt: Date; // Should match createdAt (immutable after creation)
}

export enum AppealType {
  APPEAL = 'appeal',
  OBJECTION = 'objection',
  REQUEST_REVIEW = 'request_review'
}

export enum AppealStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface IAppeal {
  _id?: string;
  caseId: string;
  decisionId?: string; // Link to decision if applicable
  type: AppealType;
  content: string;
  submittedBy: string;
  status: AppealStatus;
  responseDate?: Date;
  response?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInternalNote {
  _id?: string;
  caseId: string;
  content: string;
  createdBy: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IDocumentVersion {
  _id?: string;
  documentId: string;
  version: number;
  filePath: string;
  changes?: string; // Description of changes
  createdBy: string;
  createdAt: Date;
}

export enum RelationType {
  RELATED = 'related',
  APPEAL = 'appeal',
  MERGER = 'merger',
  SPLIT = 'split'
}

export interface IRelatedCase {
  _id?: string;
  caseId: string;
  relatedCaseId: string;
  relationType: RelationType;
  notes?: string;
  createdAt: Date;
}

export interface IReminder {
  _id?: string;
  caseId: string;
  title: string;
  dueDate: Date;
  assignedTo: string;
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum DocumentType {
  PLEADING = 'pleading',
  DECISION = 'decision',
  ATTACHMENT = 'attachment',
  PROTOCOL = 'protocol',
  EXPERT_OPINION = 'expert_opinion',
  AFFIDAVIT = 'affidavit',
  OTHER = 'other'
}

export enum AnnotationType {
  HIGHLIGHT = 'highlight',
  TEXT = 'text',
  ARROW = 'arrow',
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle'
}

export interface IAnnotation {
  _id?: string;
  requestId: string;
  documentId: string; // Reference to Document (PDF)
  pageNumber: number;
  type: AnnotationType;
  x: number; // Relative coordinate (0-1)
  y: number; // Relative coordinate (0-1)
  width: number; // Relative coordinate (0-1)
  height: number; // Relative coordinate (0-1)
  color: string; // Hex color
  content?: string; // For text annotations
  textAlign?: 'right' | 'center' | 'left'; // Text alignment for text annotations
  textBold?: boolean; // Bold text for text annotations
  createdBy: string; // User ID (arbitrator)
  timestamp: Date;
  isDeleted?: boolean; // Soft delete
  createdAt?: Date;
  updatedAt?: Date;
}

export enum ConfidentialityLevel {
  PUBLIC = 'public',
  CONFIDENTIAL = 'confidential',
  SECRET = 'secret',
  TOP_SECRET = 'top_secret'
}

export enum ExpenseCategory {
  ARBITRATOR_FEE = 'arbitrator_fee',
  ADMINISTRATIVE = 'administrative',
  EXPERT_FEE = 'expert_fee',
  LEGAL_FEE = 'legal_fee',
  TRAVEL = 'travel',
  DOCUMENTATION = 'documentation',
  OTHER = 'other'
}

export interface IExpense {
  _id?: string;
  caseId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

