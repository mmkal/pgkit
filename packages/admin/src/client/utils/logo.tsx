import {icons} from 'lucide-react'

export function AltLogo() {
  return (
    <div className="flex items-center justify-center">
      <icons.Database className="text-purple-500 mt-1 mr-1" />
      <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500">
        pg
      </div>
      <div className="text-2xl font-bold tracking-tighter text-gray-400 DISABLEDanimate-pulse">kit</div>
    </div>
  )
}
