/**
 * 同期するエンティティの定義。アプリ側の `src/sync/entities.ts` と同一の内容でなければならない
 * (api/test/sync-parity.test.ts が一致を検証する)。
 * ワイヤ上のデータは SQLite の列名(snake_case)をそのまま使い、値は文字列 / 整数 / 実数 / null のみ。
 */
export type FieldType = 'text' | 'int' | 'real' | 'bool';

export type FieldSpec = {
  name: string;
  type: FieldType;
  nullable?: boolean;
  /** text の最大文字数 */
  max?: number;
  /** text の許容値 */
  values?: readonly string[];
  /**
   * 後から追加した列。この列を知らない旧バージョンのアプリ(および旧形式で保存済みのレコード)は
   * キー自体を持たないので、欠落を許容して補う。`from` があればその列の値、なければ null。
   * (旧版端末には、この列の編集は反映されない)
   */
  legacy?: { from?: string };
};

/**
 * - mutable: 論理削除(deleted_at)を持つ可変データ。サーバー順序 + 競合コピー
 * - append: 追記専用の履歴。IDで重複排除する和集合
 * - setting: キー単位。サーバーへの到着順で後勝ち
 * - fsrs: 復習スケジュール。最後に復習した状態を採用(可換な統合)
 */
export type EntityKind = 'mutable' | 'append' | 'setting' | 'fsrs';

export type EntitySpec = {
  name: string;
  table: string;
  idColumn: string;
  kind: EntityKind;
  /** 親が先に届くようにするための順序(小さいほど先) */
  rank: number;
  /** 競合時に上書きされる側の内容を「競合コピー」として残す(本文を持つエンティティ)。field は接頭辞を付ける列 */
  conflictCopy?: { field: string };
  fields: readonly FieldSpec[];
  /**
   * 追記専用だった頃の旧バージョンが送ってくる(= legacy 列を持たない)レコードは、サーバーに既にあれば
   * 変更せず無視する。旧版が過去の記録を再送しても、新版で編集した内容を巻き戻さない。
   */
  legacyAppend?: boolean;
};

const ts = (name: string, nullable = false): FieldSpec => ({ name, type: 'int', nullable });
const mutableTimes: FieldSpec[] = [ts('created_at'), ts('updated_at'), ts('deleted_at', true)];

export const CONFLICT_COPY_PREFIX = '【競合コピー】';

export const ENTITIES: readonly EntitySpec[] = [
  {
    name: 'folders',
    table: 'folders',
    idColumn: 'id',
    kind: 'mutable',
    rank: 0,
    fields: [
      { name: 'name', type: 'text', max: 200 },
      // 色のパレットキー。旧版は持たない(null = 作成順の既定色)
      { name: 'color', type: 'text', nullable: true, max: 32, legacy: {} },
      ...mutableTimes,
    ],
  },
  {
    name: 'settings',
    table: 'settings',
    idColumn: 'key',
    kind: 'setting',
    rank: 0,
    fields: [{ name: 'value', type: 'text', max: 20000 }, ts('updated_at'), ts('deleted_at', true)],
  },
  {
    name: 'goals',
    table: 'goals',
    idColumn: 'id',
    kind: 'mutable',
    rank: 0,
    fields: [
      { name: 'title', type: 'text', max: 500 },
      ts('exam_date', true),
      { name: 'exam_day', type: 'text', nullable: true, max: 10 },
      { name: 'objective', type: 'text', max: 20000 },
      { name: 'purpose', type: 'text', max: 20000 },
      { name: 'action_plan', type: 'text', max: 50000 },
      ...mutableTimes,
    ],
  },
  {
    name: 'notes',
    table: 'notes',
    idColumn: 'id',
    kind: 'mutable',
    rank: 1,
    conflictCopy: { field: 'title' },
    fields: [
      { name: 'folder_id', type: 'text', nullable: true, max: 128 },
      { name: 'title', type: 'text', max: 500 },
      { name: 'body', type: 'text', max: 400000 },
      { name: 'pinned', type: 'bool' },
      ...mutableTimes,
    ],
  },
  {
    name: 'questions',
    table: 'questions',
    idColumn: 'id',
    kind: 'mutable',
    rank: 1,
    conflictCopy: { field: 'prompt' },
    fields: [
      { name: 'folder_id', type: 'text', max: 128 },
      { name: 'prompt', type: 'text', max: 50000 },
      { name: 'answer', type: 'text', max: 100000 },
      ...mutableTimes,
    ],
  },
  {
    name: 'study_sessions',
    table: 'study_sessions',
    idColumn: 'id',
    // 学習記録は編集できる(旧: 追記専用)。削除は deleted_at の墓標
    kind: 'mutable',
    rank: 1,
    legacyAppend: true,
    fields: [
      { name: 'folder_id', type: 'text', nullable: true, max: 128 },
      ts('started_at'),
      ts('ended_at'),
      ts('duration_seconds'),
      ts('created_at'),
      { name: 'updated_at', type: 'int', legacy: { from: 'created_at' } },
      { name: 'deleted_at', type: 'int', nullable: true, legacy: {} },
    ],
  },
  {
    name: 'fsrs_states',
    table: 'fsrs_states',
    idColumn: 'question_id',
    kind: 'fsrs',
    rank: 2,
    fields: [
      ts('due'),
      { name: 'stability', type: 'real' },
      { name: 'difficulty', type: 'real' },
      ts('elapsed_days'),
      ts('scheduled_days'),
      ts('learning_steps'),
      ts('reps'),
      ts('lapses'),
      ts('state'),
      ts('last_review', true),
      ts('updated_at'),
    ],
  },
  {
    name: 'answer_history',
    table: 'answer_history',
    idColumn: 'id',
    kind: 'append',
    rank: 2,
    fields: [
      { name: 'question_id', type: 'text', max: 128 },
      { name: 'result', type: 'text', values: ['correct', 'incorrect', 'timeout'] },
      ts('answered_at'),
      ts('created_at'),
    ],
  },
  {
    name: 'review_history',
    table: 'review_history',
    idColumn: 'id',
    kind: 'append',
    rank: 2,
    fields: [
      { name: 'question_id', type: 'text', max: 128 },
      { name: 'rating', type: 'text', values: ['again', 'hard', 'good', 'easy'] },
      ts('reviewed_at'),
      { name: 'timed_out', type: 'bool' },
      ts('elapsed_ms', true),
      ts('state'),
      ts('due'),
      { name: 'stability', type: 'real' },
      { name: 'difficulty', type: 'real' },
      ts('scheduled_days'),
      ts('learning_steps'),
      ts('created_at'),
    ],
  },
];

/** data に無い legacy 列を補う(補った列名を返す)。他の列は検証しない */
export function fillLegacy(
  spec: EntitySpec,
  data: Record<string, unknown>,
): { data: Record<string, unknown>; filled: string[] } {
  const out = { ...data };
  const filled: string[] = [];
  for (const f of spec.fields) {
    if (!f.legacy || f.name in out) continue;
    const from = f.legacy.from;
    out[f.name] = from !== undefined && from in out ? out[from] : null;
    filled.push(f.name);
  }
  return { data: out, filled };
}

export const ENTITY_BY_NAME: ReadonlyMap<string, EntitySpec> = new Map(ENTITIES.map((e) => [e.name, e]));

/** 同期する設定キー(端末固有の通知設定・タイマー実行状態は同期しない) */
export const SYNCED_SETTING_KEY =
  /^(review\.[A-Za-z]+|timer\.(focusMinutes|breakMinutes|rounds)|appearance\.darkMode)$/;

export const ID_PATTERN = /^[A-Za-z0-9._~:-]{1,128}$/;
