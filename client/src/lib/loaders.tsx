export function PageLoader() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-mm-bg-elevated rounded-lg" />
          <div className="h-4 w-32 bg-mm-bg-elevated rounded mt-2" />
        </div>
        <div className="h-10 w-32 bg-mm-bg-elevated rounded-full" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-mm-bg-card border border-mm-border rounded-xl p-5">
            <div className="h-4 w-8 bg-mm-bg-elevated rounded mb-2" />
            <div className="h-8 w-16 bg-mm-bg-elevated rounded" />
            <div className="h-3 w-20 bg-mm-bg-elevated rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-5">
        <div className="h-5 w-40 bg-mm-bg-elevated rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-mm-bg-elevated" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-3/4 bg-mm-bg-elevated rounded" />
                <div className="h-3 w-1/2 bg-mm-bg-elevated rounded" />
              </div>
              <div className="h-6 w-16 bg-mm-bg-elevated rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardLoader({ count = 4 }: { count?: number }) {
  return (
    <div className="animate-pulse grid grid-cols-2 gap-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-mm-bg-elevated" />
            <div>
              <div className="h-5 w-28 bg-mm-bg-elevated rounded" />
              <div className="h-3 w-20 bg-mm-bg-elevated rounded mt-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(j => (
              <div key={j} className="bg-mm-bg-primary rounded-lg p-3">
                <div className="h-6 w-10 bg-mm-bg-elevated rounded mx-auto" />
                <div className="h-3 w-14 bg-mm-bg-elevated rounded mx-auto mt-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridLoader() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-48 bg-mm-bg-elevated rounded-lg" />
        <div className="h-10 w-40 bg-mm-bg-elevated rounded-lg" />
      </div>
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-4">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 h-8 bg-mm-bg-elevated rounded" />
              <div className="flex-1 flex gap-1">
                {Array.from({ length: 14 }, (_, j) => (
                  <div key={j} className="flex-1 h-8 bg-mm-bg-elevated rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
