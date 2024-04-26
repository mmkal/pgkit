import React from 'react'
import {Progress} from '@/components/ui/progress'

export const FakeProgress = ({value = null as number | null, estimate: inputEstimate = 1000}) => {
  const intervalMs = 100
  const [progress, setProgress] = React.useState(0)
  const [estimate, setEstimate] = React.useState(inputEstimate)
  React.useEffect(() => setEstimate(estimate), [estimate])
  React.useEffect(() => {
    if (typeof value === 'number') {
      setProgress(value)
      return
    }

    const timeout =
      progress >= 99
        ? setTimeout(() => {
            const bumpFactor = 1.3
            setEstimate(estimate * bumpFactor)
            setProgress(progress / bumpFactor)
          }, intervalMs * 4)
        : setTimeout(() => {
            setProgress(Math.min(99, progress + 100 * (intervalMs / estimate)))
          }, intervalMs)
    return () => clearTimeout(timeout)
  }, [progress, setProgress, estimate, value])

  // if (Math.random()) return <pre>{JSON.stringify({progress, estimate, complete})}</pre>
  return <Progress className="absolute w-[99%] left-1 right-1 top-1" value={progress} />
}
