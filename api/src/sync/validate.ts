import { ENTITY_BY_NAME, ID_PATTERN, SYNCED_SETTING_KEY, type EntitySpec, type FieldSpec } from './entities';

export type Value = string | number | null;
export type RecordData = Record<string, Value>;

export const MAX_PUSH_CHANGES = 100;
export const MAX_PUSH_BODY_CHARS = 1_500_000;
export const MAX_PULL_LIMIT = 100;
/** 1レスポンスに載せるデータ量の目安(文字数)。超えた時点でページを区切る */
export const PULL_BUDGET_CHARS = 1_000_000;

export type Change = {
  spec: EntitySpec;
  id: string;
  opId: string;
  /** クライアントが最後に見たサーバー側バージョン。未取得なら null */
  baseSeq: number | null;
  data: RecordData;
};

export class ValidationError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkField(f: FieldSpec, raw: unknown): Value {
  if (raw === null) {
    if (f.nullable) return null;
    throw new ValidationError(`${f.name} は null にできません`);
  }
  switch (f.type) {
    case 'text': {
      if (typeof raw !== 'string') throw new ValidationError(`${f.name} は文字列です`);
      if (f.max !== undefined && raw.length > f.max) throw new ValidationError(`${f.name} が長すぎます`);
      if (f.values && !f.values.includes(raw)) throw new ValidationError(`${f.name} の値が不正です`);
      return raw;
    }
    case 'int':
      if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0)
        throw new ValidationError(`${f.name} は0以上の整数です`);
      return raw;
    case 'real':
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new ValidationError(`${f.name} は数値です`);
      return raw;
    case 'bool':
      if (raw !== 0 && raw !== 1) throw new ValidationError(`${f.name} は 0 または 1 です`);
      return raw;
  }
}

/** 本文の `data` をエンティティ定義で厳密に検証する(未知のキー・欠落・型違いは拒否) */
export function validateData(spec: EntitySpec, raw: unknown): RecordData {
  if (!isObject(raw)) throw new ValidationError('data が不正です');
  const allowed = new Set(spec.fields.map((f) => f.name));
  for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new ValidationError(`未知のキー: ${key}`);
  const out: RecordData = {};
  for (const f of spec.fields) {
    if (!(f.name in raw)) throw new ValidationError(`${f.name} がありません`);
    out[f.name] = checkField(f, raw[f.name]);
  }
  return out;
}

export function validateId(spec: EntitySpec, id: unknown): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new ValidationError('id が不正です');
  if (spec.kind === 'setting' && !SYNCED_SETTING_KEY.test(id))
    throw new ValidationError('同期対象外の設定です');
  return id;
}

/** push リクエスト本文の検証。ユーザーIDは本文から受け取らない(セッション由来のみ) */
export function parsePush(body: unknown): { changes: Change[] } {
  if (!isObject(body) || !Array.isArray(body.changes)) throw new ValidationError('changes が必要です');
  if (body.changes.length > MAX_PUSH_CHANGES) throw new ValidationError('changes が多すぎます');
  const seen = new Set<string>();
  const changes: Change[] = [];
  for (const raw of body.changes) {
    if (!isObject(raw)) throw new ValidationError('change が不正です');
    const spec = typeof raw.entity === 'string' ? ENTITY_BY_NAME.get(raw.entity) : undefined;
    if (!spec) throw new ValidationError('entity が不正です');
    const id = validateId(spec, raw.id);
    const opId = raw.opId;
    if (typeof opId !== 'string' || opId.length > 160 || !/^[A-Za-z0-9._~:-]+$/.test(opId))
      throw new ValidationError('opId が不正です');
    const baseSeq = raw.baseSeq;
    if (baseSeq !== null && (typeof baseSeq !== 'number' || !Number.isSafeInteger(baseSeq) || baseSeq < 0))
      throw new ValidationError('baseSeq が不正です');
    const key = `${spec.name}\u0000${id}`;
    if (seen.has(key)) throw new ValidationError('同じレコードが重複しています');
    seen.add(key);
    changes.push({ spec, id, opId, baseSeq, data: validateData(spec, raw.data) });
  }
  // 親(フォルダー等)が先にサーバーの採番順に入るようにする(安定ソート)
  changes.sort((a, b) => a.spec.rank - b.spec.rank);
  return { changes };
}

export function parseCursor(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  if (!/^\d{1,15}$/.test(raw)) throw new ValidationError('cursor が不正です');
  return Number(raw);
}

export function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return MAX_PULL_LIMIT;
  if (!/^\d{1,4}$/.test(raw)) throw new ValidationError('limit が不正です');
  return Math.min(Math.max(Number(raw), 1), MAX_PULL_LIMIT);
}
