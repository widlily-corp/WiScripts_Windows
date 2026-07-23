import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Settings, Shield, Palette, Terminal, Heart, Layers, Cpu, Code2 } from 'lucide-react';

export function SettingsView() {
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Application Settings & Configuration</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Manage execution safety defaults, inspect design system theme specifications, and view open-source credits.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Safety & Execution Defaults */}
        <div className="space-y-6">
          {/* Card 1: Safety Dry-Run Mode */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Shield className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">Execution Safety Mode</h3>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-text-primary">Global Dry-Run Default</div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  When enabled, all optimization commands, ODT setups, and MAS activation routines run in simulation mode without writing changes to host registry or services.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={dryRunMode}
                  onChange={(e) => setDryRunMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-active peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>

            <div className={`rounded-[6px] border p-3 text-xs font-mono ${
              dryRunMode
                ? 'border-brand/40 bg-brand-subtle text-brand'
                : 'border-status-warning/40 bg-status-warningSubtle text-status-warning'
            }`}>
              Status: Safety Mode is currently <span className="font-bold">{dryRunMode ? 'ACTIVE (Simulate Only)' : 'DISABLED (Live Modifications)'}</span>
            </div>
          </div>

          {/* Card 2: Environment Info */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Cpu className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">Runtime Environment</h3>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">Application Version</span>
                <span className="text-text-primary font-semibold">2.0.0</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">Tauri Framework</span>
                <span className="text-text-primary">v2.0 (Rust Desktop IPC)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">UI Architecture</span>
                <span className="text-text-primary">React 18 + Tailwind CSS</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-muted">Target Platform</span>
                <span className="text-text-primary">Windows 10 / 11 x64</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Theme Info & Credits */}
        <div className="space-y-6">
          {/* Card 3: Refined Minimal Theme Specifications */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Palette className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">Design System: Refined Minimal</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Designed following strict Refined Minimal principles (Linear/Stripe style) with muted contrast, 1px hairlines, and Geist Mono typography.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="rounded-[6px] border border-border-subtle bg-[#08090A] p-2.5 space-y-1">
                <div className="text-text-muted">Background</div>
                <div className="text-text-primary font-semibold">#08090A</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-[#121417] p-2.5 space-y-1">
                <div className="text-text-muted">Surface</div>
                <div className="text-text-primary font-semibold">#121417</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-[#22252A] p-2.5 space-y-1">
                <div className="text-text-muted">1px Hairline</div>
                <div className="text-text-primary font-semibold">#22252A</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-brand-subtle p-2.5 space-y-1">
                <div className="text-text-muted">Accent Brand</div>
                <div className="text-brand font-semibold">#3B82F6</div>
              </div>
            </div>
          </div>

          {/* Card 4: Open Source Repository Credits */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Heart className="h-4 w-4 text-status-danger" />
              <h3 className="text-sm font-semibold text-text-primary">Repository & Open Source Credits</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <Code2 className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">Microsoft Activation Scripts (MAS)</div>
                  <div className="text-text-muted text-[11px]">
                    Open-source activation scripts created by Massgrave project (HWID, Ohook, KMS38).
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Layers className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">Office Deployment Tool (ODT)</div>
                  <div className="text-text-muted text-[11px]">
                    Microsoft official Office Deployment Tool XML configuration engine integration.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Terminal className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">WiScripts Windows Utility</div>
                  <div className="text-text-muted text-[11px]">
                    High-performance native Windows administration & debloating toolkit built with Rust & Tauri.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
