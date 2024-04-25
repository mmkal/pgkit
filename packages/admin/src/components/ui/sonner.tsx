import {useTheme} from 'next-themes'
import {Toaster as Sonner} from 'sonner'

export {toast} from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({...props}: ToasterProps) => {
  const {theme = 'system'} = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      closeButton
      duration={20_000}
      toastOptions={{
        classNames: {
          toast:
            'group toast DISABLEDgroup-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          error: 'bg-red-500 text-white',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          closeButton: 'left-2 top-2',
        },
      }}
      {...props}
    />
  )
}

export {Toaster}
