import { drizzle } from 'drizzle-orm/d1';
import { createApp } from './app';
import { createAuth } from './auth';
import * as schema from './db/schema';
import { createResendSender } from './email';
import type { Bindings } from './env';

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> | Response {
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
      // 設定漏れで脆弱な署名鍵のまま稼働しない
      console.error('BETTER_AUTH_SECRET が未設定、または32文字未満です');
      return new Response('Server misconfigured', { status: 500 });
    }
    const app = createApp((waitUntil) =>
      createAuth({
        db: drizzle(env.DB, { schema }),
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        appScheme: env.APP_SCHEME,
        sendEmail: createResendSender(env),
        waitUntil,
        isDevelopment: env.APP_ENV !== 'production',
      }),
    );
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Bindings>;
