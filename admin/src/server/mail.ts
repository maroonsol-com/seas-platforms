import nodemailer from "nodemailer";

export type EmailDelivery = "sent" | "not_configured" | "failed";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

type EmailSender = (message: EmailMessage) => Promise<EmailDelivery>;

async function smtpSender(message: EmailMessage): Promise<EmailDelivery> {
  if (!isSmtpConfigured()) {
    return "not_configured";
  }

  try {
    const port = Number(process.env.SMTP_PORT || "587");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return "sent";
  } catch (error) {
    console.error(`SMTP send failed: ${mailFailure(error)}`);
    return "failed";
  }
}

function mailFailure(error: unknown): string {
  let message = error instanceof Error ? error.message : "SMTP send failed.";
  for (const secret of [process.env.SMTP_PASSWORD, process.env.SMTP_USER]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.slice(0, 300);
}

let sender: EmailSender = smtpSender;

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

export async function sendEmail(message: EmailMessage): Promise<EmailDelivery> {
  return sender(message);
}

/** Tests replace the sender. Production uses SMTP and never returns the message body. */
export function setEmailSenderForTests(next: EmailSender | null): void {
  sender = next ?? smtpSender;
}
