import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import OfflineIndicator from './OfflineIndicator'
import InstallBanner from './InstallBanner'
import OnboardingOverlay from './OnboardingOverlay'
import CreateWizard from './CreateWizard'

export default function Layout() {
  return (
    <div className="flex flex-col h-dvh bg-gray-50 w-full max-w-2xl mx-auto">
      <OnboardingOverlay />
      <OfflineIndicator />
      <InstallBanner />
      <CreateWizard />
      <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
