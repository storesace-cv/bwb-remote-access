"use client";

import type { GroupableDevice } from "@/lib/grouping";
import { DeviceCard } from "./DeviceCard";

interface UnadoptedDevicesListProps {
  devices: GroupableDevice[];
  onAdopt: (device: GroupableDevice) => void;
}

export function UnadoptedDevicesList({ devices, onAdopt }: UnadoptedDevicesListProps) {
  if (devices.length === 0) return null;

  return (
    <section className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-amber-400">
            ⚠️ Dispositivos por adoptar
          </h2>
          <p className="text-sm text-amber-300/70 mt-1">
            Estes dispositivos conectaram mas ainda precisam de informações
            adicionais (grupo, nome, etc.)
          </p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white">
          {devices.length}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onAdopt={onAdopt}
            isAdopted={false}
            showOriginTag={true}
          />
        ))}
      </div>
    </section>
  );
}
