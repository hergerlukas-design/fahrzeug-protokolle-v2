import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import OfflineIndicator from './OfflineIndicator'
import InstallBanner from './InstallBanner'
import OnboardingOverlay from './OnboardingOverlay'
import CreateWizard from './CreateWizard'

export default function Layout() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <OnboardingOverlay />
      <OfflineIndicator />
      <InstallBanner />
      <CreateWizard />
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
