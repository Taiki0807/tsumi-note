import { drizzle } from 'drizzle-orm/d1';
import { createApp } from './app';
import { createAuth } from './auth';
import * as schema from './db/schema';
import { createResendSender } from './email';
import type { Bindings } from './env';
import { parseAppEnvironment } from './redirect-policy';

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> | Response {
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
      // 設定漏れで脆弱な署名鍵のまま稼働しない
      console.error('BETTER_AUTH_SECRET が未設定、または32文字未満です');
      return new Response('Server misconfigured', { status: 500 });
    }
    try {
      parseAppEnvironment(env.APP_ENV);
    } catch (e) {
      // APP_ENV の未設定・不正値(誤った環境へのデプロイ)では稼働しない
      console.error(e instanceof Error ? e.message : 'invalid APP_ENV');
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
        environment: env.APP_ENV,
        universalLinkOrigin: env.APP_UNIVERSAL_LINK_ORIGIN,
      }),
    );
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Bindings>;
