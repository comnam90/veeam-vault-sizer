import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme, type Theme } from "@/hooks/use-theme";

const THEME_ORDER: Theme[] = ["light", "dark", "system"];

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function SiteHeader() {
  const { theme, setTheme } = useTheme();

  const nextTheme =
    THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="border-border flex items-center justify-between border-b px-6 py-4">
      <h1 className="text-foreground text-xl font-semibold">
        Veeam Data Cloud Vault Sizer
      </h1>

      <div className="flex items-center gap-4">
        <ToggleGroup type="single" defaultValue="simple" aria-label="Mode">
          <ToggleGroupItem value="simple">Simple Mode</ToggleGroupItem>

          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="cursor-not-allowed">
                <ToggleGroupItem
                  value="advanced"
                  aria-disabled="true"
                  tabIndex={-1}
                  className="pointer-events-none opacity-50"
                >
                  Advanced Mode
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </ToggleGroup>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${theme}. Click to switch to ${nextTheme}.`}
          onClick={() => setTheme(nextTheme)}
        >
          <ThemeIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}
