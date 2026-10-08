import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Toml = Record<string, any>;

/** wrangler.toml の本番デプロイ前提を検証し、問題点の一覧を返す(空なら安全) */
export function checkProductionConfig(config: Toml, opts: { allowPlaceholders?: boolean } = {}): string[] {
  const problems: string[] = [];
  const prod = config.env?.production;
  if (!prod) return ['[env.production] が定義されていません'];

  if (config.vars?.APP_ENV !== undefined) problems.push('top-level の vars に APP_ENV を置かないでください');
  if (config.d1_databases) problems.push('top-level に d1_databases を置かないでください(環境ごとに分離)');
  if (prod.vars?.APP_ENV !== 'production')
    problems.push('[env.production.vars] APP_ENV は "production" 必須です');
  if (config.env?.development?.vars?.APP_ENV !== 'development') {
    problems.push('[env.development.vars] APP_ENV は "development" 必須です');
  }
  if (!String(prod.vars?.BETTER_AUTH_URL ?? '').startsWith('https://')) {
    problems.push('production の BETTER_AUTH_URL は https:// 必須です');
  }
  const dev = config.env?.development;
  if (
    !opts.allowPlaceholders &&
    dev &&
    prod.d1_databases?.[0]?.database_id === dev.d1_databases?.[0]?.database_id
  ) {
    problems.push('development と production で同じ D1 database_id を使っています');
  }
  if (!opts.allowPlaceholders) {
    if (JSON.stringify(prod).includes('.invalid'))
      problems.push('production にダミーのドメイン(.invalid)が残っています');
    if (prod.d1_databases?.some((d: { database_id?: string }) => /^0+(-0+)*$/.test(d.database_id ?? ''))) {
      problems.push('production の D1 database_id がダミー値です');
    }
  }
  return problems;
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const config = Bun.TOML.parse(readFileSync(join(root, 'wrangler.toml'), 'utf8')) as Toml;
  const problems = checkProductionConfig(config);
  if (problems.length > 0) {
    console.error('本番デプロイを中止します:\n' + problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
}
