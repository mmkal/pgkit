import 'react-json-view-lite/dist/index.css'

import * as jsonView from 'react-json-view-lite'
import {useInspected, useSearchPath} from '../utils/inspect'

export const Inspector = () => {
  const inspected = useInspected()
  const searchPath = useSearchPath()
  return (
    <div className="h-full overflow-auto flex flex-col gap-1">
      <div>
        Search path: <pre className="inline">{searchPath}</pre>
      </div>
      <jsonView.JsonView
        data={inspected} //
        shouldExpandNode={jsonView.collapseAllNested}
        style={jsonView.darkStyles}
      />
      {/* <pre>{JSON.stringify(inspected, null, 2)}</pre> */}
    </div>
  )
}
