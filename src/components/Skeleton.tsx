/** Shimmer-Platzhalter für Ladezustände */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-gray-200 rounded animate-pulse ${className}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 flex gap-3">
      <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2 justify-center">
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
