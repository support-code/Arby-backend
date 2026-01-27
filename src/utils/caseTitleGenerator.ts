import { PartyStatus, ICaseParty, ICompany } from '../types';

/**
 * Generates automatic case title based on parties
 * Format: התובע/ת נ' הנתבע/ת
 * Rules:
 * - Company is always תובעת/נתבעת (female form)
 * - Person uses תובע/תובעת/נתבע/נתבעת based on status
 */
export function generateCaseTitle(parties: Array<{ isCompany: boolean; status: PartyStatus; name?: string; companyName?: string }>): string {
  const plaintiffs: string[] = [];
  const defendants: string[] = [];

  parties.forEach(party => {
    const name = party.isCompany ? party.companyName : party.name;
    if (!name) return;

    if (party.status === PartyStatus.PLAINTIFF || party.status === PartyStatus.PLAINTIFF_FEMALE) {
      plaintiffs.push(name);
    } else if (party.status === PartyStatus.DEFENDANT || party.status === PartyStatus.DEFENDANT_FEMALE) {
      defendants.push(name);
    }
  });

  if (plaintiffs.length === 0 && defendants.length === 0) {
    return 'תיק בוררות';
  }

  let title = '';

  // Build plaintiff part
  if (plaintiffs.length > 0) {
    const hasCompany = parties.some(p => 
      (p.status === PartyStatus.PLAINTIFF || p.status === PartyStatus.PLAINTIFF_FEMALE) && p.isCompany
    );
    const hasFemalePerson = parties.some(p => 
      p.status === PartyStatus.PLAINTIFF_FEMALE && !p.isCompany
    );
    
    const plaintiffLabel = hasCompany || hasFemalePerson ? 'התובעת' : 'התובע';
    title = `${plaintiffLabel} ${plaintiffs.join(' ו-')}`;
  }

  // Add separator
  if (plaintiffs.length > 0 && defendants.length > 0) {
    title += ' נ\' ';
  }

  // Build defendant part
  if (defendants.length > 0) {
    const hasCompany = parties.some(p => 
      (p.status === PartyStatus.DEFENDANT || p.status === PartyStatus.DEFENDANT_FEMALE) && p.isCompany
    );
    const hasFemalePerson = parties.some(p => 
      p.status === PartyStatus.DEFENDANT_FEMALE && !p.isCompany
    );
    
    const defendantLabel = hasCompany || hasFemalePerson ? 'הנתבעת' : 'הנתבע';
    title += `${defendantLabel} ${defendants.join(' ו-')}`;
  }

  return title;
}


