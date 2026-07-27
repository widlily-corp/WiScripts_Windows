import React from 'react';

interface SparklineAreaGraphProps {
  data: number[];
  colorHex?: string;
  gradientId: string;
  height?: number;
  maxValOverride?: number;
  valueFormatter?: (val: number) => string;
}

export function SparklineAreaGraph({
  data,
  colorHex = '#3B82F6',
  gradientId,
  height = 64,
  maxValOverride,
  valueFormatter,
}: SparklineAreaGraphProps) {
  if (!data || data.length < 2) {
    return (
      <div
        style={{ height }}
        className="w-full bg-surface-subtle border border-border-subtle/50 animate-pulse rounded-[4px] flex items-center justify-center text-xs font-mono text-text-muted"
      >
        Collecting telemetry metrics...
      </div>
    );
  }

  const width = 300;
  const calculatedMax = Math.max(...data, 1);
  const maxVal = maxValOverride ?? (calculatedMax === 0 ? 100 : calculatedMax * 1.1);
  const minVal = 0;
  const stepX = width / Math.max(1, data.length - 1);

  const points = data.map((val, idx) => {
    const x = idx * stepX;
    const normalized = Math.max(0, Math.min(maxVal, val));
    const range = maxVal - minVal || 1;
    const y = height - (normalized / range) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width.toFixed(1)},${height} L 0,${height} Z`;

  const lastValue = data[data.length - 1] ?? 0;
  const formattedLast = valueFormatter ? valueFormatter(lastValue) : lastValue.toFixed(1);

  const lastPointParts = points[points.length - 1].split(',');
  const lastX = parseFloat(lastPointParts[0]);
  const lastY = parseFloat(lastPointParts[1]);

  return (
    <div className="relative w-full overflow-hidden select-none flex flex-col justify-between">
      <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
        <span className="text-text-muted">Live Load Path</span>
        <span className="font-semibold text-text-primary tabular-nums" style={{ color: colorHex }}>
          {formattedLast}
        </span>
      </div>

      <div className="relative w-full" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorHex} stopOpacity="0.30" />
              <stop offset="100%" stopColor={colorHex} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Hairline Grid Lines */}
          <line
            x1="0"
            y1={height * 0.25}
            x2={width}
            y2={height * 0.25}
            stroke="#22252A"
            strokeDasharray="2,2"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1={height * 0.5}
            x2={width}
            y2={height * 0.5}
            stroke="#22252A"
            strokeDasharray="2,2"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1={height * 0.75}
            x2={width}
            y2={height * 0.75}
            stroke="#22252A"
            strokeDasharray="2,2"
            strokeWidth="1"
          />

          {/* Area Gradient Fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Crisp Hairline Stroke */}
          <path
            d={linePath}
            fill="none"
            stroke={colorHex}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live Endpoint Dot */}
          {!isNaN(lastX) && !isNaN(lastY) && (
            <>
              <circle cx={lastX} cy={lastY} r="3" fill={colorHex} />
              <circle cx={lastX} cy={lastY} r="6" fill={colorHex} opacity="0.4" className="animate-ping" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
