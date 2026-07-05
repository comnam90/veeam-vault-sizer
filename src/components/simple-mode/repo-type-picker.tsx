import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  REPO_CATEGORY_LABEL,
  REPO_TYPE_CATEGORY,
  REPO_TYPE_LABEL,
  type RepoCategory,
  type RepoType,
} from "@/types/simple-mode";

interface RepoTypePickerProps {
  value: RepoType;
  allowedTypes: RepoType[];
  onChange: (value: RepoType) => void;
}

const CATEGORY_ORDER: RepoCategory[] = [
  "vault",
  "block-file",
  "object-storage",
];

export function RepoTypePicker({
  value,
  allowedTypes,
  onChange,
}: RepoTypePickerProps) {
  const [activeCategory, setActiveCategory] = useState<RepoCategory>(
    REPO_TYPE_CATEGORY[value],
  );

  // A controlled component must reflect its `value` prop regardless of how
  // the parent changes it — not just via this picker's own onChange. Without
  // this, a parent that reassigns `value` to a type in a different category
  // by some other means (a reset, a preset switch) would leave the picker
  // showing the wrong category, and the real selection would appear to have
  // no highlighted button at all. This is the render-phase "adjusting state
  // when a prop changes" pattern React's own docs recommend for this case —
  // it avoids the extra-render flicker a useEffect-based sync would cause.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setActiveCategory(REPO_TYPE_CATEGORY[value]);
  }

  const categories = CATEGORY_ORDER.filter((category) =>
    allowedTypes.some((type) => REPO_TYPE_CATEGORY[type] === category),
  );

  const typesInActiveCategory = allowedTypes.filter(
    (type) => REPO_TYPE_CATEGORY[type] === activeCategory,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            aria-pressed={category === activeCategory}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              category === activeCategory
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            {REPO_CATEGORY_LABEL[category]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {typesInActiveCategory.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={type === value}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              type === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            {REPO_TYPE_LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
