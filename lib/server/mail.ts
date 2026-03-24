import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

function getMailConfig(): MailConfig {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = Number(process.env.SMTP_PORT ?? "0");
  const secure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const password = process.env.SMTP_PASSWORD?.trim() ?? "";
  const from = process.env.SMTP_FROM?.trim() ?? "";
  if (!host || !port || !user || !password || !from) {
    throw new Error("SMTP is not configured");
  }
  return { host, port, secure, user, password, from };
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve().then(() => {
      const config = getMailConfig();
      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password
        }
      });
    });
  }
  return transporterPromise;
}

async function sendTextMail(subject: string, text: string, email: string) {
  const config = getMailConfig();
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: config.from,
    to: email,
    subject,
    text
  });
}

export async function sendRegisterVerificationCode(email: string, code: string) {
  await sendTextMail(
    "知惑注册验证码",
    `你的知惑注册验证码是：${code}

验证码 10 分钟内有效。
如果这不是你的操作，请忽略这封邮件。`,
    email
  );
}

export async function sendPasswordResetVerificationCode(email: string, code: string) {
  await sendTextMail(
    "知惑重置密码验证码",
    `你的知惑重置密码验证码是：${code}

验证码 10 分钟内有效。
如果这不是你的操作，请忽略这封邮件。`,
    email
  );
}
