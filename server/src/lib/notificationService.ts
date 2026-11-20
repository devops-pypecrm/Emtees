import { sendUserCredentialsEmail } from "./email";
import { getDb } from "../queries/connection";
import { notifications } from "@db/schema";
import { sendNotification } from "./notificationEngine";

// Providers Configuration
// In the future, import Twilio / Wati / etc. here

export type NotificationChannel = "email" | "sms" | "whatsapp" | "in_app";

export interface SendMessageOptions {
  userId: number;
  phone?: string;
  email?: string;
  subject?: string;
  message: string;
  type: string;
  channels: NotificationChannel[];
}

export const NotificationService = {
  /**
   * Dispatch a notification across multiple channels
   */
  async dispatch(options: SendMessageOptions) {
    let { phone, email } = options;
    const { userId, subject, message, type, channels } = options;

    const results: Record<string, boolean> = {};

    // Fill in missing contact details from the user record, and honour the admin switches (SRS 18, 19).
    if ((channels.includes("email") && !email) || (channels.includes("whatsapp") && !phone)) {
      try {
        const { getDb } = await import("../queries/connection");
        const { users } = await import("@db/schema");
        const { eq } = await import("drizzle-orm");
        const u = await getDb().query.users.findFirst({ where: eq(users.id, userId) });
        email = email || u?.email || undefined;
        phone = phone || u?.phone || undefined;
      } catch { /* contact lookup is best-effort */ }
    }
    const off = async (key: string) => {
      try {
        const { getDb } = await import("../queries/connection");
        const { getStringSetting } = await import("./settings");
        return (await getStringSetting(getDb(), key, key === "notify_whatsapp" ? "no" : "yes")) === "no";
      } catch { return false; }
    };

    for (const channel of channels) {
      try {
        switch (channel) {
          case "in_app":
            await sendNotification(userId, subject || "Notification", message, type);
            results["in_app"] = true;
            break;

          case "email":
            if (email && !(await off("notify_email"))) {
              results["email"] = await this.sendEmail(email, subject || "Notification", message);
            }
            break;

          case "sms":
            if (phone) {
              results["sms"] = await this.sendSMS(phone, message);
            }
            break;

          case "whatsapp":
            if (phone && !(await off("notify_whatsapp"))) {
              results["whatsapp"] = await this.sendWhatsApp(phone, message);
            }
            break;
        }
      } catch (err) {
        console.error(`[NotificationService] Failed to send via ${channel} to user ${userId}:`, err);
        results[channel] = false;
      }
    }

    return results;
  },

  async sendEmail(to: string, subject: string, htmlContent: string) {
    // For now, we reuse the existing transporter in email.ts or just log if no SMTP configured
    // Since we only have sendUserCredentialsEmail right now, we can mock generic emails here
    const hasSmtp = !!process.env.SMTP_HOST;
    if (!hasSmtp) {
      console.log(`[SIMULATED EMAIL] To: ${to} | Subject: ${subject} | Body: ${htmlContent}`);
      return true;
    }

    // Dynamic import to avoid circular dependencies if any, or just import transporter
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"EMTEES Academy" <noreply@emtees.com>',
        to,
        subject,
        html: htmlContent,
      });
      return true;
    } catch (e) {
      console.error("[Email Delivery Error]", e);
      return false;
    }
  },

  async sendSMS(phone: string, message: string) {
    // TODO: Integrate MSG91 / Twilio
    console.log(`[SIMULATED SMS] To: ${phone} | Message: ${message}`);
    return true;
  },

  /**
   * WhatsApp Cloud API (Meta). Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the server .env to send for real;
   * without them messages are only logged. Free-form text works inside the 24-hour window; outside it Meta
   * requires an approved template, which is a business-account setup step.
   */
  async sendWhatsApp(phone: string, message: string) {
    const token = process.env.WHATSAPP_TOKEN, id = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !id) {
      console.log(`[WHATSAPP not configured] To: ${phone} | Message: ${message}`);
      return false;
    }
    let to = phone.replace(/[^\d]/g, "");
    if (to.length === 10) to = "91" + to;
    const res = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message } }),
    });
    if (!res.ok) console.error("[WHATSAPP] send failed:", res.status, await res.text().catch(() => ""));
    return res.ok;
  }
};
