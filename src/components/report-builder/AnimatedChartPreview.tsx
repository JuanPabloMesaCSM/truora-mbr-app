import { motion } from "framer-motion";
import type { ChartType } from "./moduleDefinitions";

interface Props {
  chart: ChartType;
  color: string;
}

const ease = "easeOut";

export function AnimatedCanvasChart({ chart, color }: Props) {
  const w = 80, h = 40;

  switch (chart) {
    case "donut":
    case "donut-list": {
      const r = 14, cx = 20, cy = 20;
      const circ = 2 * Math.PI * r;
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <motion.circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={color} strokeWidth="4" opacity={0.4}
            strokeDasharray={`${circ * 0.63} ${circ}`}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.8, ease }}
          />
          <motion.circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={color} strokeWidth="4" opacity={0.7}
            strokeDasharray={`${circ * 0.34} ${circ}`}
            strokeDashoffset={-circ * 0.63}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: -circ * 0.63 }}
            transition={{ duration: 0.8, ease, delay: 0.1 }}
          />
          {chart === "donut-list" &&
            [12, 20, 28].map((y, i) => (
              <motion.rect
                key={y} x="44" y={y} width="30" height="2" rx="1"
                fill={color} opacity={0.3}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.06 }}
                style={{ originX: 0 }}
              />
            ))}
        </svg>
      );
    }

    case "vertical-bars": {
      const bars = [
        { x: 8, h: 24 }, { x: 22, h: 32 }, { x: 36, h: 18 },
        { x: 50, h: 28 }, { x: 64, h: 22 },
      ];
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {bars.map((b, i) => (
            <motion.rect
              key={i} x={b.x} width="8" rx="1.5"
              fill={color} opacity={0.3 + i * 0.12}
              initial={{ y: 40, height: 0 }}
              animate={{ y: 40 - b.h, height: b.h }}
              transition={{ duration: 0.6, ease, delay: i * 0.1 }}
            />
          ))}
        </svg>
      );
    }

    case "horizontal-bars": {
      const bars = [
        { y: 4, w: 65 }, { y: 12, w: 48 }, { y: 20, w: 58 }, { y: 28, w: 35 },
      ];
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {bars.map((b, i) => (
            <motion.rect
              key={i} x="0" y={b.y} height="5" rx="1.5"
              fill={color} opacity={0.3 + i * 0.15}
              initial={{ width: 0 }}
              animate={{ width: b.w }}
              transition={{ duration: 0.5, ease, delay: i * 0.08 }}
            />
          ))}
        </svg>
      );
    }

    case "stacked-bars":
    case "stacked-100": {
      const stacks = [
        { x: 6, full: 28, top: 14 },
        { x: 22, full: 22, top: 10 },
        { x: 38, full: 30, top: 16 },
        { x: 54, full: 20, top: 8 },
      ];
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {stacks.map((s, i) => (
            <g key={i}>
              <motion.rect
                x={s.x} width="10" rx="1.5"
                fill={color} opacity={0.25}
                initial={{ y: 6 + s.full, height: 0 }}
                animate={{ y: 6, height: s.full }}
                transition={{ duration: 0.7, ease, delay: i * 0.08 }}
              />
              <motion.rect
                x={s.x} width="10" rx="1.5"
                fill={color} opacity={0.6}
                initial={{ y: 6 + s.full, height: 0 }}
                animate={{ y: 6 + s.full - s.top, height: s.top }}
                transition={{ duration: 0.7, ease, delay: 0.15 + i * 0.08 }}
              />
            </g>
          ))}
        </svg>
      );
    }

    case "table":
    case "kpi-table": {
      const rows = [4, 12, 19, 26, 33];
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {rows.map((y, i) => (
            <motion.rect
              key={y} x="0" y={y} width="80" rx={i === 0 ? "1" : "0.5"}
              height={i === 0 ? 2.5 : 1.5}
              fill={color} opacity={i === 0 ? 0.5 : 0.15}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: i === 0 ? 0.5 : 0.15, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            />
          ))}
        </svg>
      );
    }

    case "ranked-list":
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[4, 12, 20, 28, 36].map((y, i) => (
            <motion.g
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <text x="2" y={y + 4} fill={color} opacity={0.5} fontSize="5" fontWeight="600">
                {i + 1}
              </text>
              <motion.rect
                x="12" y={y} height="4" rx="1.5"
                fill={color} opacity={0.6 - i * 0.08}
                initial={{ width: 0 }}
                animate={{ width: 65 - i * 10 }}
                transition={{ duration: 0.5, ease, delay: 0.1 + i * 0.06 }}
              />
            </motion.g>
          ))}
        </svg>
      );

    case "semicircles": {
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          <motion.path
            d="M10 35 A25 25 0 0 1 40 10"
            fill="none" stroke={color} strokeWidth="4" opacity={0.4}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease }}
          />
          <motion.path
            d="M40 10 A25 25 0 0 1 70 35"
            fill="none" stroke={color} strokeWidth="4" opacity={0.7}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease, delay: 0.15 }}
          />
        </svg>
      );
    }

    case "bars-line":
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[6, 22, 38, 54].map((x, i) => (
            <motion.rect
              key={i} x={x} width="10" rx="1.5"
              fill={color} opacity={0.25}
              initial={{ y: 40, height: 0 }}
              animate={{ y: 40 - [20, 28, 16, 24][i], height: [20, 28, 16, 24][i] }}
              transition={{ duration: 0.6, ease, delay: i * 0.1 }}
            />
          ))}
          <motion.polyline
            points="11,22 27,14 43,26 59,18"
            fill="none" stroke={color} strokeWidth="2" opacity={0.8}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.4, ease }}
          />
        </svg>
      );

    case "kpi-mom":
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[
            { x: 2, w: 24 },
            { x: 30, w: 24 },
            { x: 58, w: 20 },
          ].map((b, i) => (
            <motion.rect
              key={i} x={b.x} y="4" width={b.w} height="14" rx="3"
              fill={color} opacity={0.15}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 0.15 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
              style={{ originY: 0.5 }}
            />
          ))}
          <motion.polyline
            points="14,30 42,26 68,32"
            fill="none" stroke={color} strokeWidth="1.5" opacity={0.5}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease }}
          />
        </svg>
      );

    case "grouped-bars":
      return (
        <svg width={w} height={h} viewBox="0 0 80 40">
          {[4, 28, 52].map((x, i) => (
            <g key={i}>
              <motion.rect
                x={x} width="8" rx="1.5"
                fill={color} opacity={0.35}
                initial={{ y: 40, height: 0 }}
                animate={{ y: 40 - [24, 18, 28][i], height: [24, 18, 28][i] }}
                transition={{ duration: 0.6, ease, delay: i * 0.1 }}
              />
              <motion.rect
                x={x + 10} width="8" rx="1.5"
                fill={color} opacity={0.65}
                initial={{ y: 40, height: 0 }}
                animate={{ y: 40 - [16, 26, 14][i], height: [16, 26, 14][i] }}
                transition={{ duration: 0.6, ease, delay: 0.05 + i * 0.1 }}
              />
            </g>
          ))}
        </svg>
      );

    default:
      return <div className="w-20 h-10 rounded" style={{ background: `${color}10` }} />;
  }
}
