import 'react-json-view-lite/dist/index.css'

import * as jsonView from 'react-json-view-lite'
import {useInspected, useSearchPath} from '../utils/inspect'

export const Inspector = () => {
  const inspected = useInspected()
  const searchPath = useSearchPath()
  return (
    <div className="h-[80vh]">
      Search path: <pre className="inline">{searchPath}</pre>
      <jsonView.JsonView
        data={inspected} //
        shouldExpandNode={jsonView.collapseAllNested}
        style={jsonView.darkStyles}
      />
      {/* <pre>{JSON.stringify(inspected, null, 2)}</pre> */}
    </div>
  )
}
