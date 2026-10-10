/**
 * FSRS状態の統合規則(サーバー api/src/sync/service.ts の `fsrsWins` と同一)。
 * 全順序: 最後に復習した方 → 復習回数が多い方 → 更新が新しい方。
 * どの順で統合しても結果が同じになる(可換)ので、端末の時計のずれでスケジュールが巻き戻らない。
 */
export type FsrsComparable = { last_review: number | null; reps: number; updated_at: number };

function rank(d: FsrsComparable): [number, number, number] {
  return [d.last_review ?? -1, d.reps, d.updated_at];
}

/** `incoming` が `current` より新しい復習状態か(同順位なら false = 現状維持) */
export function fsrsWins(incoming: FsrsComparable, current: FsrsComparable): boolean {
  const a = rank(incoming);
  const b = rank(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return x > y;
  }
  return false;
}
