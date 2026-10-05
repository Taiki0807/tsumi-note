import Svg, { Rect } from 'react-native-svg';

/** App icon motif (stacked notes with a bookmark), drawn on the Figma 200×200 grid. */
export function AppIcon({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="つみノート">
      <Rect width={200} height={200} rx={44} fill="#6949ff" />
      <Rect x={39} y={40} width={122} height={34} rx={8} fill="#d4ccff" />
      <Rect x={39} y={40} width={19} height={34} rx={8} fill="#a391ff" />
      <Rect x={39} y={80} width={109} height={34} rx={8} fill="#f0edff" />
      <Rect x={39} y={80} width={19} height={34} rx={8} fill="#d4ccff" />
      <Rect x={39} y={120} width={109} height={34} rx={8} fill="#ffffff" />
      <Rect x={39} y={120} width={19} height={34} rx={8} fill="#f0edff" />
      <Rect x={133} y={34} width={16} height={45} rx={3} fill="#ffc107" />
    </Svg>
  );
}
