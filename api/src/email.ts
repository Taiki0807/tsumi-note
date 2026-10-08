export type EmailMessage = { to: string; subject: string; text: string };

/** メール送信の抽象。テストでは差し替える。 */
export type EmailSender = (message: EmailMessage) => Promise<void>;

type EmailEnv = { RESEND_API_KEY?: string; EMAIL_FROM: string; APP_ENV: string };

/**
 * Resend 経由の送信。APIキー未設定時:
 * - production: 例外(設定漏れを黙って握りつぶさない)
 * - development: 送信せずスキップ(本文・リンクはログに出さない)
 */
export function createResendSender(env: EmailEnv): EmailSender {
  return async (message) => {
    if (!env.RESEND_API_KEY) {
      if (env.APP_ENV === 'production') throw new Error('RESEND_API_KEY is not configured');
      console.warn('[email] RESEND_API_KEY 未設定のためメール送信をスキップしました');
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      // 宛先や本文は出さずステータスのみ記録する
      throw new Error(`Resend request failed: ${res.status}`);
    }
  };
}

export function verificationEmail(url: string): Pick<EmailMessage, 'subject' | 'text'> {
  return {
    subject: '【つみノート】メールアドレスの確認',
    text: [
      'つみノートにご登録いただきありがとうございます。',
      '次のリンクを開いて、メールアドレスの確認を完了してください。',
      '',
      url,
      '',
      'このリンクの有効期限は1時間です。期限が切れた場合は、アプリから確認メールを再送してください。',
      '心当たりがない場合は、このメールを破棄してください。',
    ].join('\n'),
  };
}

export function passwordResetEmail(url: string): Pick<EmailMessage, 'subject' | 'text'> {
  return {
    subject: '【つみノート】パスワードの再設定',
    text: [
      'パスワード再設定のリクエストを受け付けました。',
      '次のリンクを開いて、新しいパスワードを設定してください。',
      '',
      url,
      '',
      'このリンクの有効期限は1時間です。',
      '心当たりがない場合は、このメールを破棄してください(パスワードは変更されません)。',
    ].join('\n'),
  };
}

export function existingAccountEmail(): Pick<EmailMessage, 'subject' | 'text'> {
  return {
    subject: '【つみノート】アカウント登録のお知らせ',
    text: [
      'このメールアドレスで新規登録の操作がありましたが、すでにアカウントが存在します。',
      'ログインできない場合は、アプリの「パスワードを忘れた場合」から再設定してください。',
      '心当たりがない場合は、このメールを破棄してください。',
    ].join('\n'),
  };
}
