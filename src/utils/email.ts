import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
};

interface SendPasswordEmailParams {
  email: string;
  name: string;
  password: string;
  role: string;
  caseTitle?: string;
}

/**
 * Send password email to new user
 */
export const sendPasswordEmail = async ({
  email,
  name,
  password,
  role,
  caseTitle
}: SendPasswordEmailParams): Promise<void> => {
  try {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.warn('⚠️ Email not configured - skipping email send');
      return;
    }

    const transporter = createTransporter();

    const roleLabels: Record<string, string> = {
      admin: 'מנהל מערכת',
      arbitrator: 'בורר',
      lawyer: 'עורך דין',
      party: 'צד'
    };

    const roleLabel = roleLabels[role] || role;

    const subject = caseTitle
      ? `הרשמה למערכת Negotify - תיק: ${caseTitle}`
      : 'הרשמה למערכת Negotify';

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Negotify</h1>
          <p style="color: white; margin: 10px 0 0 0;">פלטפורמת ניהול בוררות דיגיטלית</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${name},</h2>
          
          ${caseTitle ? `
            <p style="color: #666; font-size: 16px;">
              נרשמת למערכת Negotify כחלק מתיק הבוררות: <strong>${caseTitle}</strong>
            </p>
          ` : `
            <p style="color: #666; font-size: 16px;">
              נוצר עבורך חשבון במערכת Negotify
            </p>
          `}
          
          <p style="color: #666; font-size: 16px;">
            תפקידך במערכת: <strong>${roleLabel}</strong>
          </p>
          
          <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #333; font-weight: bold;">פרטי ההתחברות שלך:</p>
            <p style="margin: 5px 0; color: #666;">
              <strong>אימייל:</strong> ${email}
            </p>
            <p style="margin: 5px 0; color: #666;">
              <strong>סיסמה:</strong> 
              <span style="font-family: monospace; background: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-size: 18px; font-weight: bold; color: #667eea;">
                ${password}
              </span>
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 40px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold;
                      display: inline-block;">
              התחבר למערכת
            </a>
          </div>
          
          <p style="color: #999; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            <strong>חשוב:</strong> אנא שמור את הסיסמה במקום בטוח. מומלץ לשנות את הסיסמה לאחר ההתחברות הראשונה.
          </p>
          
          <p style="color: #999; font-size: 12px; margin-top: 20px;">
            אם לא ביקשת חשבון זה, אנא התעלם ממייל זה.
          </p>
        </div>
      </div>
    `;

    const text = `
שלום ${name},

${caseTitle ? `נרשמת למערכת Negotify כחלק מתיק הבוררות: ${caseTitle}` : 'נוצר עבורך חשבון במערכת Negotify'}

תפקידך במערכת: ${roleLabel}

פרטי ההתחברות:
אימייל: ${email}
סיסמה: ${password}

התחברות: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login

חשוב: אנא שמור את הסיסמה במקום בטוח. מומלץ לשנות את הסיסמה לאחר ההתחברות הראשונה.
    `.trim();

    await transporter.sendMail({
      from: `"Negotify" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text,
      html
    });

    console.log(`✅ Email sent to ${email}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    // Don't throw - we don't want to fail user creation if email fails
  }
};

/**
 * Send bulk password emails
 */
export const sendBulkPasswordEmails = async (
  users: Array<{ email: string; name: string; password: string; role: string }>,
  caseTitle?: string
): Promise<void> => {
  for (const user of users) {
    await sendPasswordEmail({
      email: user.email,
      name: user.name,
      password: user.password,
      role: user.role,
      caseTitle
    });
  }
};

