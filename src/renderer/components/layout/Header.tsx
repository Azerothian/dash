import { Menu, Moon, Sun, Monitor } from 'lucide-react'
import { useUiStore } from '../../stores/ui-store'
import type { ThemeSetting } from '@shared/entities'

const themeIcons: Record<ThemeSetting, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const themeOrder: ThemeSetting[] = ['light', 'dark', 'system']

export function Header() {
  const { theme, setTheme, toggleSidebar } = useUiStore()

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(theme)
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length]
    setTheme(nextTheme)
  }

  const ThemeIcon = themeIcons[theme]

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-background px-4">
      <button
        onClick={toggleSidebar}
        className="mr-4 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        title="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-lg font-semibold">Dash</h1>

      <div className="flex-1" />

      <button
        onClick={cycleTheme}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        title={`Theme: ${theme}`}
      >
        <ThemeIcon className="h-4 w-4" />
        <span className="capitalize">{theme}</span>
      </button>
    </header>
  )
}
