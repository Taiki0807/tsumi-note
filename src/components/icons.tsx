import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'chart' | 'note' | 'clock' | 'cards' | 'user';

type Props = {
  name: IconName;
  size: number;
  color: string;
  /** Matches the Figma stroke weight (heavier when the tab is active). */
  strokeWidth?: number;
};

/**
 * Outline icons matching the Figma icon set (Icon/chart, note, clock, cards, user).
 * Figma only exposes the vector bounds through the REST API, so the paths are drawn to those
 * bounds and should be swapped for exported SVGs when available.
 */
export function Icon({ name, size, color, strokeWidth = 2 }: Props) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'chart' && (
        <>
          <Path d="M4 20V10" {...common} />
          <Path d="M10 20V4" {...common} />
          <Path d="M16 20v-7" {...common} />
          <Path d="M20 20H3" {...common} />
        </>
      )}
      {name === 'note' && (
        <>
          <Path d="M6 3h8l4 4v14H6z" {...common} />
          <Path d="M14 3v4h4" {...common} />
          <Path d="M9 12h6M9 16h6" {...common} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M12 7v5l3 2" {...common} />
        </>
      )}
      {name === 'cards' && (
        <>
          <Rect x={4} y={7} width={13} height={13} rx={2} {...common} />
          <Path d="M8 4h10a2 2 0 0 1 2 2v10" {...common} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" {...common} />
        </>
      )}
    </Svg>
  );
}
