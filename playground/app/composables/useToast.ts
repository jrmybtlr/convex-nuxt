let toastTimer: ReturnType<typeof setTimeout> | undefined

export function useToast() {
  const toast = useState<string | null>('playground-toast', () => null)
  const toastKey = useState('playground-toast-key', () => 0)

  function showToast(message: string) {
    toastKey.value += 1
    toast.value = message
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      toast.value = null
      toastTimer = undefined
    }, 2500)
  }

  return { toast, toastKey, showToast }
}
