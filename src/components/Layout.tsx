import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import FabCreate from './FabCreate'
import OfflineIndicator from './OfflineIndicator'
import InstallBanner from './InstallBanner'
import UpdateBanner from './UpdateBanner'
import OnboardingOverlay from './OnboardingOverlay'
import CreateWizard from './CreateWizard'

export default function Layout() {
  return (
    <div className="flex h-dvh bg-gray-50 w-full">
      <Sidebar />
      {/* The content keeps its phone-sized column and stays centered in
          whatever space the sidebar leaves. `relative` anchors the FAB. */}
      <div className="flex-1 min-w-0 flex justify-center">
        <div className="relative flex flex-col h-full w-full max-w-2xl">
          <OnboardingOverlay />
          <OfflineIndicator />
          <InstallBanner />
          <UpdateBanner />
          <CreateWizard />
          <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
            <Outlet />
          </main>
          <FabCreate />
        </div>
      </div>
    </div>
  )
}
