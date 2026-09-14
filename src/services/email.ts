import nodemailer from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;


let transporter: nodemailer.Transporter | null = null;

if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
}

export async function sendRequestNotification({
    teacherEmail,
    teacherName,
    studentName,
    subjectNames,
    schedule,
    requestId,
}: {
    teacherEmail: string;
    teacherName: string;
    studentName: string;
    subjectNames: string[];
    schedule?: string | null;
    requestId: string;
}) {
    if (!transporter) {
        console.log('📧 SMTP not configured, skipping email.');
        return;
    }

    const subject = `📚 New tuition request from ${studentName}`;
    const scheduleText = schedule || 'No specific schedule mentioned.';
    const subjectsList = subjectNames.join(', ');
    const dashboardLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/teacher/requests`;

    const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f9fafb; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
      .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
      .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
      .divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
      .footer { margin-top: 32px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <span class="logo">TuitionHub</span>
      </div>
      <h2>You have a new tuition request! 🎓</h2>
      <p><strong>Student:</strong> ${studentName}</p>
      <p><strong>Subjects:</strong> ${subjectsList}</p>
      <p><strong>Schedule:</strong> ${scheduleText}</p>
      <div class="divider"></div>
      <p>Please log in to your dashboard to respond to this request.</p>
      <a href="${dashboardLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">View & Respond</a>
      <div class="footer">
        This email was sent to you because you are a registered teacher on TuitionHub.
        <br />&copy; ${new Date().getFullYear()} TuitionHub. All rights reserved.
      </div>
    </div>
  </body>
  </html>
`;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || `TuitionHub <${SMTP_USER}>`,
            to: teacherEmail,
            subject,
            html,
        });
        console.log(`📧 Email sent to ${teacherEmail}`);
    } catch (error) {
        console.error('❌ Failed to send email:', error);
        // Don't throw – don't block the request
    }
}

export async function sendSubjectRequestNotification({
    teacherName,
    teacherEmail,
    subjectName,
    category,
}: {
    teacherName: string;
    teacherEmail: string;
    subjectName: string;
    category?: string;
}) {
    if (!transporter) {
        console.log('📧 SMTP not configured, skipping email.');
        return;
    }

    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.log('📧 No admin notify email configured, skipping.');
        return;
    }

    const adminLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/system-portal-8k2x`;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2>New subject request 📚</h2>
      <p><strong>Teacher:</strong> ${teacherName} (${teacherEmail})</p>
      <p><strong>Requested subject:</strong> ${subjectName}</p>
      <p><strong>Category:</strong> ${category || "—"}</p>
      <p>Log in to the admin panel to approve or reject this request.</p>
      <a href="${adminLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 12px;">Open Admin Panel</a>
    </div>
  `;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || `TuitionHub <${SMTP_USER}>`,
            to: adminEmail,
            subject: `📚 Subject request: ${subjectName}`,
            html,
        });
        console.log(`📧 Subject request email sent to ${adminEmail}`);
    } catch (error) {
        console.error('❌ Failed to send subject request email:', error);
    }
}

export async function sendVerificationEmail(toEmail: string, fullName: string, code: string) {
  if (!transporter) {
    console.log('📧 SMTP not configured, skipping email.');
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; text-align: center;">
      <h2>Verify your email</h2>
      <p>Hi ${fullName}, use this code to verify your TuitionHub account:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f1f5f9; padding: 16px; border-radius: 12px; margin: 20px 0;">
        ${code}
      </div>
      <p style="color: #6b7280; font-size: 13px;">This code expires in 10 minutes.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `TuitionHub <${SMTP_USER}>`,
      to: toEmail,
      subject: `${code} is your verification code`,
      html,
    });
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
  }
}

export async function sendPasswordResetEmail(toEmail: string, fullName: string, resetLink: string) {
  if (!transporter) {
    console.log('📧 SMTP not configured, skipping email.');
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
      <h2>Reset your password</h2>
      <p>Hi ${fullName}, we received a request to reset your TuitionHub password.</p>
      <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">Reset Password</a>
      <p style="color: #6b7280; font-size: 13px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `TuitionHub <${SMTP_USER}>`,
      to: toEmail,
      subject: 'Reset your TuitionHub password',
      html,
    });
    console.log(`📧 Password reset email sent to ${toEmail}`);
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
  }
}

export async function sendFeedbackNotification({
  userName,
  userEmail,
  role,
  type,
  message,
}: {
  userName: string;
  userEmail: string;
  role: string;
  type: string;
  message: string;
}) {
  if (!transporter) {
    console.log('📧 SMTP not configured, skipping email.');
    return;
  }

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const typeLabel = { bug: "🐛 Bug Report", feature: "✨ Feature Request", other: "💬 Feedback" }[type] || "Feedback";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2>${typeLabel}</h2>
      <p><strong>From:</strong> ${userName} (${userEmail}) — ${role}</p>
      <div style="background: #f1f5f9; padding: 16px; border-radius: 12px; margin: 16px 0; white-space: pre-wrap;">${message}</div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `TuitionHub <${SMTP_USER}>`,
      to: adminEmail,
      subject: `${typeLabel} from ${userName}`,
      html,
    });
    console.log(`📧 Feedback email sent to ${adminEmail}`);
  } catch (error) {
    console.error('❌ Failed to send feedback email:', error);
  }
}