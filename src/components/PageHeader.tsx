import { useTranslation } from 'react-i18next'
import { ArrowLeft, Menu } from 'lucide-react'
import { SIDEBAR_EVENT } from './Sidebar'

function AppLogo() {
  return (
    <img
      src="/logo.webp"
      alt=""
      className="w-6 h-6 object-contain flex-shrink-0"
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  )
}

interface PageHeaderProps {
  /** Centered title. */
  title: React.ReactNode
  /**
   * Sub-pages pass a back handler — that puts the arrow in the left slot.
   * Without it the slot holds the hamburger, so the drawer is reachable from
   * every top-level page and nowhere competes with a back arrow.
   */
  onBack?: () => void
  /** Small line under the title, e.g. the license plate of the open protocol. */
  subtitle?: string
  /** Icon left of the title. Top-level pages fall back to the app logo. */
  icon?: React.ReactNode
  /** Right slot — step counter, action button. */
  right?: React.ReactNode
  /** Rendered under the title row, inside the horizontal padding. */
  children?: React.ReactNode
  /** Rendered edge to edge below the padded block, still inside the sticky box. */
  below?: React.ReactNode
  size?: 'md' | 'lg'
}

export default function PageHeader({
  title,
  onBack,
  subtitle,
  icon,
  right,
  children,
  below,
  size = 'md',
}: PageHeaderProps) {
  const { t } = useTranslation()
  const leadIcon = icon ?? (onBack ? null : <AppLogo />)

  return (
    <div className="sticky top-0 z-10 bg-white">
      <div className="border-b border-gray-200 px-4 pt-4 pb-3">
        {/* 1fr auto 1fr keeps the middle column centered regardless of how
            wide the two side slots turn out to be. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-start min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('common.back')}
                className="p-1 -ml-1 text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT))}
                aria-label={t('nav.menu')}
                /* From md up the sidebar is permanently visible, so the
                   hamburger would only be noise. */
                className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <Menu size={22} />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center min-w-0">
            <h1
              className={`flex items-center gap-1.5 min-w-0 font-bold text-gray-900 ${
                size === 'lg' ? 'text-xl' : 'text-base'
              }`}
            >
              {leadIcon}
              <span className="truncate">{title}</span>
            </h1>
            {subtitle && <p className="text-xs text-gray-500 truncate max-w-full">{subtitle}</p>}
          </div>

          <div className="flex items-center justify-end min-w-0">{right}</div>
        </div>

        {children && <div className="mt-3">{children}</div>}
      </div>
      {below}
    </div>
  )
}
