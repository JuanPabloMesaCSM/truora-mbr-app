import type { ChartType } from "./moduleDefinitions";

interface ChartIconProps {
  chart: ChartType;
  color: string;
  size: number;
}

export function ChartIcon({ chart, color, size: s }: ChartIconProps) {
  switch (chart) {
    case 'donut':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          <circle cx="14" cy="14" r="10" fill="none" stroke={color} strokeWidth="4" strokeDasharray="45 63" opacity={0.3} />
          <circle cx="14" cy="14" r="10" fill="none" stroke={color} strokeWidth="4" strokeDasharray="45 63" strokeDashoffset="-45" />
        </svg>
      );
    case 'vertical-bars':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[4, 10, 17, 23].map((x, i) => (
            <rect key={i} x={x} y={28 - [16, 22, 12, 18][i]} width="4" height={[16, 22, 12, 18][i]} rx="1" fill={color} opacity={0.4 + i * 0.15} />
          ))}
        </svg>
      );
    case 'horizontal-bars':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[4, 10, 16, 22].map((y, i) => (
            <rect key={i} x="2" y={y} width={[22, 16, 20, 12][i]} height="3" rx="1" fill={color} opacity={0.4 + i * 0.15} />
          ))}
        </svg>
      );
    case 'stacked-bars':
    case 'stacked-100':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[4, 11, 18].map((x, i) => (
            <g key={i}>
              <rect x={x} y={8} width="5" height={[12, 16, 10][i]} rx="1" fill={color} opacity={0.3} />
              <rect x={x} y={8 + [12, 16, 10][i] - [6, 8, 5][i]} width="5" height={[6, 8, 5][i]} rx="1" fill={color} opacity={0.7} />
            </g>
          ))}
        </svg>
      );
    case 'table':
    case 'kpi-table':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[6, 11, 16, 21].map(y => (
            <rect key={y} x="3" y={y} width="22" height="1.5" rx="0.5" fill={color} opacity={0.3} />
          ))}
          <rect x="3" y="3" width="22" height="1.5" rx="0.5" fill={color} opacity={0.7} />
        </svg>
      );
    case 'ranked-list':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[4, 9, 14, 19, 24].map((y, i) => (
            <rect key={i} x="6" y={y} width={22 - i * 3} height="2.5" rx="1" fill={color} opacity={0.7 - i * 0.1} />
          ))}
        </svg>
      );
    case 'semicircles':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          <path d="M4 18 A10 10 0 0 1 14 8" fill="none" stroke={color} strokeWidth="3" opacity={0.5} />
          <path d="M14 8 A10 10 0 0 1 24 18" fill="none" stroke={color} strokeWidth="3" opacity={0.8} />
        </svg>
      );
    case 'donut-list':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          <circle cx="9" cy="14" r="6" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="25 38" />
          {[8, 13, 18].map(y => (
            <rect key={y} x="18" y={y} width="8" height="1.5" rx="0.5" fill={color} opacity={0.4} />
          ))}
        </svg>
      );
    case 'bars-line':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[4, 10, 16, 22].map((x, i) => (
            <rect key={i} x={x} y={28 - [14, 18, 10, 16][i]} width="4" height={[14, 18, 10, 16][i]} rx="1" fill={color} opacity={0.3} />
          ))}
          <polyline points="6,16 12,12 18,20 24,14" fill="none" stroke={color} strokeWidth="1.5" opacity={0.8} />
        </svg>
      );
    case 'kpi-mom':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          <rect x="3" y="4" width="10" height="8" rx="2" fill={color} opacity={0.2} />
          <rect x="15" y="4" width="10" height="8" rx="2" fill={color} opacity={0.2} />
          <rect x="3" y="16" width="22" height="1.5" rx="0.5" fill={color} opacity={0.3} />
          <rect x="3" y="20" width="22" height="1.5" rx="0.5" fill={color} opacity={0.3} />
        </svg>
      );
    case 'grouped-bars':
      return (
        <svg width={s} height={s} viewBox="0 0 28 28" className="shrink-0">
          {[3, 13].map((x, i) => (
            <g key={i}>
              <rect x={x} y={28 - [18, 14][i]} width="4" height={[18, 14][i]} rx="1" fill={color} opacity={0.5} />
              <rect x={x + 5} y={28 - [12, 20][i]} width="4" height={[12, 20][i]} rx="1" fill={color} opacity={0.8} />
            </g>
          ))}
        </svg>
      );
    default:
      return <div className="w-7 h-7 rounded bg-muted shrink-0" />;
  }
}

/* Larger chart preview for canvas slides */
export function CanvasChartPreview({ chart, color }: { chart: string; color: string }) {
  const w = 80, h = 40;
  switch (chart) {
    case 'donut':
    case 'donut-list':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="4" strokeDasharray="55 88" opacity={0.4} />
          <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="4" strokeDasharray="30 88" strokeDashoffset="-55" opacity={0.7} />
          {chart === 'donut-list' && [12, 20, 28].map(y => (
            <rect key={y} x="44" y={y} width="30" height="2" rx="1" fill={color} opacity={0.3} />
          ))}
        </svg>
      );
    case 'vertical-bars':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[8, 22, 36, 50, 64].map((x, i) => (
            <rect key={i} x={x} y={40 - [24, 32, 18, 28, 22][i]} width="8" height={[24, 32, 18, 28, 22][i]} rx="1.5" fill={color} opacity={0.3 + i * 0.12} />
          ))}
        </svg>
      );
    case 'horizontal-bars':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[4, 12, 20, 28].map((y, i) => (
            <rect key={i} x="0" y={y} width={[65, 48, 58, 35][i]} height="5" rx="1.5" fill={color} opacity={0.3 + i * 0.15} />
          ))}
        </svg>
      );
    case 'stacked-bars':
    case 'stacked-100':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[6, 22, 38, 54].map((x, i) => (
            <g key={i}>
              <rect x={x} y={6} width="10" height={[28, 22, 30, 20][i]} rx="1.5" fill={color} opacity={0.25} />
              <rect x={x} y={6 + [28, 22, 30, 20][i] - [14, 10, 16, 8][i]} width="10" height={[14, 10, 16, 8][i]} rx="1.5" fill={color} opacity={0.6} />
            </g>
          ))}
        </svg>
      );
    case 'table':
    case 'kpi-table':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <rect x="0" y="4" width="80" height="2.5" rx="1" fill={color} opacity={0.5} />
          {[12, 19, 26, 33].map(y => (
            <rect key={y} x="0" y={y} width="80" height="1.5" rx="0.5" fill={color} opacity={0.15} />
          ))}
        </svg>
      );
    case 'ranked-list':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[4, 12, 20, 28, 36].map((y, i) => (
            <g key={i}>
              <text x="2" y={y + 4} fill={color} opacity={0.5} fontSize="5" fontWeight="600">{i + 1}</text>
              <rect x="12" y={y} width={65 - i * 10} height="4" rx="1.5" fill={color} opacity={0.6 - i * 0.08} />
            </g>
          ))}
        </svg>
      );
    case 'semicircles':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <path d="M10 35 A25 25 0 0 1 40 10" fill="none" stroke={color} strokeWidth="4" opacity={0.4} />
          <path d="M40 10 A25 25 0 0 1 70 35" fill="none" stroke={color} strokeWidth="4" opacity={0.7} />
        </svg>
      );
    case 'bars-line':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[6, 22, 38, 54].map((x, i) => (
            <rect key={i} x={x} y={40 - [20, 28, 16, 24][i]} width="10" height={[20, 28, 16, 24][i]} rx="1.5" fill={color} opacity={0.25} />
          ))}
          <polyline points="11,22 27,14 43,26 59,18" fill="none" stroke={color} strokeWidth="2" opacity={0.8} />
        </svg>
      );
    case 'kpi-mom':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <rect x="2" y="4" width="24" height="14" rx="3" fill={color} opacity={0.15} />
          <rect x="30" y="4" width="24" height="14" rx="3" fill={color} opacity={0.15} />
          <rect x="58" y="4" width="20" height="14" rx="3" fill={color} opacity={0.15} />
          <polyline points="14,30 42,26 68,32" fill="none" stroke={color} strokeWidth="1.5" opacity={0.5} />
        </svg>
      );
    case 'grouped-bars':
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[4, 28, 52].map((x, i) => (
            <g key={i}>
              <rect x={x} y={40 - [24, 18, 28][i]} width="8" height={[24, 18, 28][i]} rx="1.5" fill={color} opacity={0.35} />
              <rect x={x + 10} y={40 - [16, 26, 14][i]} width="8" height={[16, 26, 14][i]} rx="1.5" fill={color} opacity={0.65} />
            </g>
          ))}
        </svg>
      );
    default:
      return <div className="w-20 h-10 rounded" style={{ background: `${color}10` }} />;
  }
}
