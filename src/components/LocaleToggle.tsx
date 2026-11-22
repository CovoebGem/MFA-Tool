import { Globe } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { cn } from "../lib/utils";
import type { Locale } from "../lib/locale-store";

const localeOptions: { value: Locale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "EN" },
];

export default function LocaleToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/80 p-1">
      <Globe className="ml-1.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="grid flex-1 grid-cols-2 gap-1">
        {localeOptions.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setLocale(value)}
            aria-label={label}
            title={label}
            className={cn(
              "rounded-md py-1 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 cursor-pointer",
              locale === value
                ? "bg-card text-primary shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
