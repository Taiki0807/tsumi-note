import Svg, { Rect } from 'react-native-svg';

/** App icon motif (stacked notes with a bookmark). Geometry from Figma AppIcon (200:483), 200×200 grid. */
export function AppIcon({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="つみノート">
      <Rect width={200} height={200} rx={44} fill="#6949ff" />
      <Rect x={39.0625} y={118.75} width={121.875} height={34.375} rx={8} fill="#d4ccff" />
      <Rect x={39.0625} y={118.75} width={18.75} height={34.375} rx={8} fill="#a391ff" />
      <Rect x={70.3125} y={132.8125} width={70.3125} height={6.25} rx={3} fill="#ffffff" fillOpacity={0.55} />
      <Rect x={48.4375} y={81.25} width={109.375} height={34.375} rx={8} fill="#f0edff" />
      <Rect x={48.4375} y={81.25} width={18.75} height={34.375} rx={8} fill="#d4ccff" />
      <Rect x={78.125} y={95.3125} width={57.8125} height={6.25} rx={3} fill="#d4ccff" />
      <Rect x={43.75} y={43.75} width={109.375} height={34.375} rx={8} fill="#ffffff" />
      <Rect x={43.75} y={43.75} width={18.75} height={34.375} rx={8} fill="#f0edff" />
      <Rect x={73.4375} y={57.8125} width={39.0625} height={6.25} rx={3} fill="#d4ccff" />
      <Rect x={125} y={43.75} width={15.625} height={45.3125} rx={3} fill="#ffc107" />
    </Svg>
  );
}
