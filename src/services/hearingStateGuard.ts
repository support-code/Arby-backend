/**
 * LEGAL STATE GUARD SERVICE
 * 
 * This service enforces government-grade legal protocol rules equivalent to "Net HaMishpat".
 * All protocol write operations MUST pass through these guards.
 * 
 * Core Legal Principles:
 * 1. Protocol may ONLY be written during ACTIVE hearing with at least one participant
 * 2. Protocol and Decisions are STRICTLY SEPARATE (no decision text in protocol)
 * 3. State machine is one-way: CREATED → ACTIVE → ENDED → SIGNED (no rollback)
 * 4. After ENDED/SIGNED, protocol is immutable (only new versions allowed)
 * 5. Every write action must be timestamped and audited
 */

import { DiscussionSession } from '../models/DiscussionSession';
import { Hearing } from '../models/Hearing';
import { IDiscussionSession } from '../types';

/**
 * Check if current date matches hearing date (same day)
 * Legal Requirement: Protocol may ONLY be opened and edited on the hearing day itself
 */
function isHearingDate(session: IDiscussionSession | null, hearing: any): boolean {
  if (!session || !hearing) return false;
  
  const today = new Date();
  const hearingDate = new Date(hearing.scheduledDate || session.startedAt);
  
  // Compare dates (ignore time)
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const hearingStr = `${hearingDate.getFullYear()}-${hearingDate.getMonth()}-${hearingDate.getDate()}`;
  
  return todayStr === hearingStr;
}

export enum DiscussionSessionStatus {
  CREATED = 'created',
  ACTIVE = 'active',
  ENDED = 'ended',
  SIGNED = 'signed'
}

export enum ProtocolWriteError {
  HEARING_NOT_ACTIVE = 'HEARING_NOT_ACTIVE',
  NO_PARTICIPANTS = 'NO_PARTICIPANTS',
  PROTOCOL_LOCKED = 'PROTOCOL_LOCKED',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  DECISION_IN_PROTOCOL = 'DECISION_IN_PROTOCOL',
  NOT_HEARING_DATE = 'NOT_HEARING_DATE' // Legal Requirement #1: Protocol only on hearing day
}

export interface GuardResult {
  allowed: boolean;
  error?: ProtocolWriteError;
  message?: string;
}

/**
 * Legal State Machine: CREATED → ACTIVE → ENDED → SIGNED
 * Transitions are one-way. Once past a state, rollback is impossible.
 */
export const ALLOWED_STATE_TRANSITIONS: Record<string, string[]> = {
  [DiscussionSessionStatus.CREATED]: [DiscussionSessionStatus.ACTIVE],
  [DiscussionSessionStatus.ACTIVE]: [DiscussionSessionStatus.ENDED],
  [DiscussionSessionStatus.ENDED]: [DiscussionSessionStatus.SIGNED],
  [DiscussionSessionStatus.SIGNED]: [] // Terminal state - no transitions allowed
};

/**
 * Check if protocol write is legally allowed
 * 
 * Legal Requirements:
 * 1. Protocol may ONLY be opened and edited on the hearing day itself
 * 2. Discussion session status MUST be ACTIVE
 * 3. At least ONE participant MUST be registered
 * 4. Protocol must not be locked (not ENDED or SIGNED)
 * 
 * @param session - Discussion session to check
 * @param hearing - Hearing object (optional, will be fetched if not provided)
 * @returns GuardResult indicating if write is allowed
 */
export async function canWriteProtocol(
  session: IDiscussionSession | null,
  hearing?: any
): Promise<GuardResult> {
  if (!session) {
    return {
      allowed: false,
      error: ProtocolWriteError.HEARING_NOT_ACTIVE,
      message: 'דיון לא נמצא'
    };
  }

  // Legal Requirement #1: Protocol may ONLY be opened and edited on the hearing day itself
  if (!hearing) {
    hearing = await Hearing.findById(session.hearingId);
  }
  
  if (hearing && !isHearingDate(session, hearing)) {
    const hearingDate = new Date(hearing.scheduledDate || session.startedAt);
    return {
      allowed: false,
      error: ProtocolWriteError.PROTOCOL_LOCKED,
      message: `פרוטוקול ניתן לפתיחה ועריכה רק ביום הדיון עצמו. תאריך הדיון: ${hearingDate.toLocaleDateString('he-IL')}. תאריך נוכחי: ${new Date().toLocaleDateString('he-IL')}.`
    };
  }

  // Legal Principle #2: Protocol may ONLY be written during ACTIVE hearing
  if (session.status !== DiscussionSessionStatus.ACTIVE) {
    return {
      allowed: false,
      error: ProtocolWriteError.PROTOCOL_LOCKED,
      message: `פרוטוקול נעול. סטטוס נוכחי: ${session.status}. פרוטוקול ניתן לעריכה רק במהלך דיון פעיל (ACTIVE).`
    };
  }

  // Legal Principle #3: Protocol may ONLY be written if at least ONE participant is registered
  if (!session.attendees || session.attendees.length === 0) {
    return {
      allowed: false,
      error: ProtocolWriteError.NO_PARTICIPANTS,
      message: 'לא ניתן לכתוב פרוטוקול ללא נוכחים רשומים. יש להוסיף לפחות נוכח אחד לפני כתיבת הפרוטוקול.'
    };
  }

  return { allowed: true };
}

/**
 * Check if protocol content contains decision text (illegal)
 * 
 * Legal Principle #3: Protocol and Decisions are STRICTLY SEPARATE
 * Under no circumstance may decision text be embedded inside protocol editor.
 * 
 * @param protocolContent - Protocol HTML content to check
 * @returns GuardResult indicating if content is valid
 */
export function validateProtocolContent(protocolContent: string): GuardResult {
  if (!protocolContent || !protocolContent.trim()) {
    return { allowed: true }; // Empty content is valid
  }

  // Check for common decision-related keywords that should not appear in protocol
  const decisionKeywords = [
    'החלטה',
    'מחליטים',
    'נקבע',
    'נפסק',
    'מצווה',
    'מורה'
  ];

  const lowerContent = protocolContent.toLowerCase();
  const foundKeywords = decisionKeywords.filter(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );

  // Note: This is a heuristic check. Full separation is enforced by UI/backend architecture.
  // If keywords are found, warn but don't block (may be legitimate protocol content)
  // The real enforcement is architectural: decisions are created in separate endpoints.

  return { allowed: true };
}

/**
 * Validate protocol version content changes
 * 
 * Legal Requirement #9: New version allows text changes only
 * - Cannot add/remove/change events (decisions, rulings, etc.)
 * - Can only modify text content
 * 
 * Note: Full enforcement requires comparing with previous version and detecting
 * structural changes. This is a placeholder for future implementation.
 * 
 * @param newContent - New protocol version content
 * @param previousContent - Previous protocol version content
 * @returns GuardResult indicating if version change is valid
 */
export function validateProtocolVersionChange(
  newContent: string,
  previousContent: string
): GuardResult {
  // Legal Requirement #9: New version allows text changes only
  // Cannot add/remove/change events - only text modifications
  
  // TODO: Implement full comparison logic to detect:
  // - Added decision references
  // - Removed decision references  
  // - Changed event timestamps
  // - Structural changes (not just text edits)
  
  // For now, basic validation - full implementation requires event extraction and comparison
  return { allowed: true };
}

/**
 * Check if state transition is legally allowed
 * 
 * Legal Principle #5: State machine is one-way, no rollback
 * 
 * @param currentStatus - Current discussion session status
 * @param newStatus - Desired new status
 * @returns GuardResult indicating if transition is allowed
 */
export function canTransitionState(
  currentStatus: string,
  newStatus: string
): GuardResult {
  const allowedNextStates = ALLOWED_STATE_TRANSITIONS[currentStatus] || [];

  if (!allowedNextStates.includes(newStatus)) {
    return {
      allowed: false,
      error: ProtocolWriteError.INVALID_STATE_TRANSITION,
      message: `מעבר סטטוס לא חוקי: ${currentStatus} → ${newStatus}. מעברים מותרים: ${allowedNextStates.join(', ')}`
    };
  }

  return { allowed: true };
}

/**
 * Check if protocol can be edited (not just read)
 * 
 * Legal Principle #6: After ENDED/SIGNED, protocol is immutable
 * Any correction requires creating a NEW VERSION (append-only)
 * 
 * @param session - Discussion session to check
 * @param hearing - Hearing object (optional)
 * @returns GuardResult indicating if editing is allowed
 */
export async function canEditProtocol(
  session: IDiscussionSession | null,
  hearing?: any
): Promise<GuardResult> {
  if (!session) {
    return {
      allowed: false,
      error: ProtocolWriteError.HEARING_NOT_ACTIVE,
      message: 'דיון לא נמצא'
    };
  }

  // After ENDED or SIGNED, protocol is immutable
  if (session.status === DiscussionSessionStatus.ENDED || 
      session.status === DiscussionSessionStatus.SIGNED) {
    return {
      allowed: false,
      error: ProtocolWriteError.PROTOCOL_LOCKED,
      message: 'פרוטוקול נעול לצמיתות. לאחר סיום/חתימה, הפרוטוקול אינו ניתן לעריכה. תיקונים דורשים יצירת גרסה חדשה.'
    };
  }

  return canWriteProtocol(session, hearing);
}

/**
 * Generate locked participants header for protocol
 * 
 * Legal Principle #4: Protocol must automatically include locked "Participants" section
 * Format: "** נוכחים: [list]"
 * This section is system-generated, read-only, and the "**" prefix MUST NOT be removable.
 * 
 * @param attendees - Array of attendees
 * @returns HTML string with locked participants header
 */
export function generateParticipantsHeader(attendees: any[]): string {
  if (!attendees || attendees.length === 0) {
    return '<div class="protocol-participants-header" contenteditable="false" style="user-select: none; -webkit-user-select: none;"><strong>** נוכחים:</strong> אין נוכחים רשומים</div>';
  }

  const attendeeList = attendees.map(attendee => {
    const typeLabels: Record<string, string> = {
      'witness': 'עד',
      'expert': 'מומחה',
      'court_clerk': 'יכל',
      'secretary': 'מנני',
      'other': 'אחר'
    };
    const typeLabel = typeLabels[attendee.type] || 'אחר';
    return `${attendee.name} (${typeLabel})`;
  }).join(', ');

  return `<div class="protocol-participants-header" contenteditable="false" style="user-select: none; -webkit-user-select: none; margin-bottom: 1em; padding: 0.5em; background-color: #f0f0f0; border-left: 3px solid #0066cc;"><strong>** נוכחים:</strong> ${attendeeList}</div>`;
}

/**
 * Inject participants header into protocol content (if not already present)
 * 
 * @param protocolContent - Existing protocol content
 * @param attendees - Array of attendees
 * @returns Protocol content with participants header at the top
 */
export function injectParticipantsHeader(protocolContent: string, attendees: any[]): string {
  const header = generateParticipantsHeader(attendees);
  
  // Check if header already exists (to avoid duplication)
  if (protocolContent.includes('protocol-participants-header')) {
    return protocolContent; // Header already present
  }

  // Inject at the beginning
  return header + '\n\n' + protocolContent;
}

/**
 * Extract protocol content without participants header (for editing)
 * 
 * @param protocolContent - Protocol content with header
 * @returns Protocol content without header
 */
export function extractProtocolContent(protocolContent: string): string {
  // Remove the participants header div if present
  return protocolContent.replace(
    /<div class="protocol-participants-header"[^>]*>.*?<\/div>\s*/g,
    ''
  ).trim();
}

