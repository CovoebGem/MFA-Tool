import { ArrowDown, ArrowUp } from "lucide-react";
import { NativeSelect } from "./ui/native-select";
import { Button } from "./ui/button";
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
    <div className="flex items-center gap-1.5">
      <NativeSelect
        value={config.field}
        onChange={(e) =>
          onChange({ ...config, field: e.target.value as SortField })
        }
        aria-label="排序字段"
        wrapperClassName="w-auto min-w-[6.5rem]"
        className="h-8 text-xs"
      >
        {fieldOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </NativeSelect>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() =>
          onChange({
            ...config,
            direction: config.direction === "asc" ? "desc" : "asc",
          })
        }
        aria-label={config.direction === "asc" ? "升序，点击切换为降序" : "降序，点击切换为升序"}
        title={config.direction === "asc" ? "升序" : "降序"}
      >
        {config.direction === "asc" ? (
          <ArrowUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
