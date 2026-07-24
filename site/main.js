const copyButtons = document.querySelectorAll('[data-copy]')

for (const button of copyButtons) {
  button.addEventListener('click', async () => {
    const label = button.querySelector('.copy-label')
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      label.textContent = 'Copied'
      window.setTimeout(() => {
        label.textContent = 'Copy'
      }, 1800)
    } catch {
      label.textContent = 'Select command'
    }
  })
}
