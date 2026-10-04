import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import FabCreate from './FabCreate'
import OfflineIndicator from './OfflineIndicator'
import InstallBanner from './InstallBanner'
import UpdateBanner from './UpdateBanner'
import BottomNav from './BottomNav'
import OnboardingOverlay from './OnboardingOverlay'
import CreateWizard from './CreateWizard'

export default function Layout() {
  return (
    // `fixed inset-0` instead of `h-dvh`: in the installed PWA some iPhones
    // report 100dvh shorter than the screen, which left an empty strip at the
    // bottom and pushed the FAB up onto the page's buttons.
    <div className="fixed inset-0 flex bg-gray-50">
      <Sidebar />
      {/* The content keeps its phone-sized column and stays centered in
          whatever space the sidebar leaves. `relative` anchors the FAB.
          The safe-area padding sits here, above the banners, so an update or
          offline banner starts below the status bar instead of under it. */}
      <div className="flex-1 min-w-0 flex justify-center pt-[env(safe-area-inset-top)]">
        <div className="relative flex flex-col h-full w-full max-w-2xl">
          <OnboardingOverlay />
          <OfflineIndicator />
          <InstallBanner />
          <UpdateBanner />
          <CreateWizard />
          <main className="flex-1 min-h-0 overflow-y-auto">
            <Outlet />
          </main>
          <FabCreate />
          <BottomNav />
        </div>
      </div>
    </div>
  )
}
