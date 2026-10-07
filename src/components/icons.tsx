import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'chart'
  | 'note'
  | 'clock'
  | 'check'
  | 'cards'
  | 'user'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'more'
  | 'arrow-up'
  | 'arrow-down';

type Props = {
  name: IconName;
  size: number;
  color: string;
  /** Matches the Figma stroke weight (heavier when the tab is active). */
  strokeWidth?: number;
  /** Clock only: colour of the hands when it differs from the outline (Figma StatCard). */
  handsColor?: string;
};

/**
 * Outline icons matching the Figma icon set (Icon/chart, note, clock, cards, user).
 * Figma only exposes the vector bounds through the REST API, so the paths are drawn to those
 * bounds and should be swapped for exported SVGs when available.
 */
export function Icon({ name, size, color, strokeWidth = 2, handsColor }: Props) {
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
          <Path d="M12 7v5l3 2" {...common} stroke={handsColor ?? color} />
        </>
      )}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...common} />}
      {name === 'cards' && (
        <>
          <Rect x={4} y={7} width={13} height={13} rx={2} {...common} />
          <Path d="M8 4h10a2 2 0 0 1 2 2v10" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            {...common}
          />
        </>
      )}
      {name === 'chevron-left' && <Path d="M15 5l-7 7 7 7" {...common} />}
      {name === 'chevron-right' && <Path d="M9 5l7 7-7 7" {...common} />}
      {name === 'arrow-up' && <Path d="M12 19V5M6 11l6-6 6 6" {...common} />}
      {name === 'arrow-down' && <Path d="M12 5v14M6 13l6 6 6-6" {...common} />}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.5} fill={color} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Circle cx={19} cy={12} r={1.5} fill={color} />
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
