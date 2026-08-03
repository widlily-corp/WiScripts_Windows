import React from 'react';
import { Cpu, HardDrive, Thermometer, ChevronDown } from 'lucide-react';
import { ThermalStatus, TemperatureSensorInfo } from '../types';

interface TemperatureSensorWidgetProps {
  title: string;
  tempC: number | null;
  sensorType: 'cpu' | 'gpu';
  thermalStatus: ThermalStatus;
  sensorSource?: string;
  availableSensors?: TemperatureSensorInfo[];
  selectedSensorId?: string | null;
  onSelectSensor?: (sensorId: string | null) => void;
}

export function TemperatureSensorWidget({
  title,
  tempC,
  sensorType,
  thermalStatus,
  sensorSource,
  availableSensors = [],
  selectedSensorId = null,
  onSelectSensor,
}: TemperatureSensorWidgetProps) {
  const getBadgeStyle = (status: ThermalStatus) => {
    switch (status) {
      case 'normal':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'warm':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'hot':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-surface-subtle text-text-muted border-border-subtle';
    }
  };

  const getStatusLabel = (status: ThermalStatus) => {
    switch (status) {
      case 'normal':
        return 'Optimal';
      case 'warm':
        return 'Elevated';
      case 'hot':
        return 'Critical';
      default:
        return 'Unavailable';
    }
  };

  const Icon = sensorType === 'cpu' ? Cpu : HardDrive;
  const isAvailable = tempC !== null;
  const percent = isAvailable ? Math.min(100, Math.max(0, (tempC / 100) * 100)) : 0;

  return (
    <div className="rounded-[6px] border border-border bg-[#08090A] p-4 space-y-3 shadow-sm hover:border-border-focus transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-secondary">
          <Icon className="h-4 w-4 text-brand" />
          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        </div>
        <span
          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] border font-bold ${getBadgeStyle(
            thermalStatus
          )}`}
        >
          {getStatusLabel(thermalStatus)}
        </span>
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-text-muted" />
          <span className="text-2xl font-bold font-mono tabular-nums text-text-primary">
            {isAvailable ? `${tempC.toFixed(1)}°C` : 'N/A'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-text-muted text-right">
          {isAvailable ? 'Max Threshold: 95°C' : 'Requires Admin / Unsupported'}
        </span>
      </div>

      {/* Progress Bar Gauge */}
      <div className="w-full bg-surface-subtle h-2 rounded-full overflow-hidden border border-border-subtle">
        <div
          className={`h-full transition-all duration-500 ${
            thermalStatus === 'hot'
              ? 'bg-red-500'
              : thermalStatus === 'warm'
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Sensor Selection Dropdown */}
      {onSelectSensor && (
        <div className="space-y-1 pt-1">
          <label
            htmlFor={`sensor-select-${sensorType}`}
            className="text-[10px] font-mono uppercase tracking-wider text-text-muted block"
          >
            Select Temperature Sensor
          </label>
          <div className="relative">
            <select
              id={`sensor-select-${sensorType}`}
              aria-label={`Select ${title} temperature sensor`}
              value={selectedSensorId || ''}
              onChange={(e) => onSelectSensor(e.target.value || null)}
              className="w-full bg-[#0D0E10] text-text-primary border border-border-subtle rounded-[4px] px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-brand appearance-none cursor-pointer pr-7 truncate"
            >
              <option value="">Auto-detect (Default)</option>
              {availableSensors.map((sensor) => (
                <option key={sensor.id} value={sensor.id}>
                  {sensor.label || sensor.name} ({sensor.provider}) - {sensor.temperatureCelsius.toFixed(1)}°C
                </option>
              ))}
            </select>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted absolute right-2 top-2.5 pointer-events-none" />
          </div>
        </div>
      )}

      {sensorSource && (
        <div className="text-[10px] font-mono text-text-muted flex justify-between pt-1 border-t border-border-subtle/40">
          <span>Source:</span>
          <span className="truncate max-w-[200px] text-text-secondary">{sensorSource}</span>
        </div>
      )}
    </div>
  );
}
