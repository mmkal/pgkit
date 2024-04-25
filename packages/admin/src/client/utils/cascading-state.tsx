import React from 'react'

// workaround https://github.com/streamich/react-use/issues/2551
type ReturnTypeOfUseState<T> = [T, React.Dispatch<React.SetStateAction<T>>, unknown?]
type ReturnTypeOfUseLocalStorage<T> = [T | undefined, React.Dispatch<React.SetStateAction<T | undefined>>, unknown?]

/** This might exist in some form out there, but this cuts down on boilerplate when you want a parent and a child component to share a state */
export function createCascadingState<T>(
  defaultValue: T,
  useStateHook: (value: T) => ReturnTypeOfUseState<T> | ReturnTypeOfUseLocalStorage<T> = React.useState,
) {
  const context = React.createContext<ReturnTypeOfUseState<T>>([
    defaultValue,
    () => {
      throw new Error('useState must be used within a Provider')
    },
  ])

  const useState = () => {
    const value = React.useContext(context)
    if (value === undefined) {
      throw new Error('useState must be used within a Provider')
    }
    return value
  }
  const Provider = ({children}: {children: React.ReactNode}) => {
    const hook = useStateHook(defaultValue) as ReturnTypeOfUseState<T>
    return <context.Provider value={hook}>{children}</context.Provider>
  }
  const wrap =
    <P extends {}>(Component: React.ComponentType<P>) =>
    (props: P) => (
      <Provider>
        <Component {...props} />
      </Provider>
    )
  return {
    useState,
    Provider,
    wrap,
    /** in case you need the raw context for some reason */
    context,
  }
}
