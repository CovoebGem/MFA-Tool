import type { SortConfig, SortField } from "../types";

interface SortControlsProps {
  config: SortConfig;
  onChange: (config: SortConfig) => void;
}

const fieldOptions: { value: SortField; label: string }[] = [
  { value: "name", label: "名称" },
  { value: "issuer", label: "服务商" },
  { value: "createdAt", label: "创建时间" },
];

export default function SortControls({ config, onChange }: SortControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={config.field}
        onChange={(e) =>
          onChange({ ...config, field: e.target.value as SortField })
        }
        aria-label="排序字段"
        className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {fieldOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        onClick={() =>
          onChange({
            ...config,
            direction: config.direction === "asc" ? "desc" : "asc",
          })
        }
        aria-label={config.direction === "asc" ? "升序，点击切换为降序" : "降序，点击切换为升序"}
        title={config.direction === "asc" ? "升序" : "降序"}
        className="px-2 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {config.direction === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
