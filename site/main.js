const analyticsEndpoint = 'https://loke.dev/api/events'

function track(event, placement, target) {
  const body = JSON.stringify({
    v: 1,
    event,
    path: window.location.pathname,
    placement,
    target,
  })

  fetch(analyticsEndpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  }).catch(() => undefined)
}

const copyButtons = document.querySelectorAll('[data-copy]')

for (const button of copyButtons) {
  button.addEventListener('click', async () => {
    const label = button.querySelector('.copy-label')
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      label.textContent = 'Copied'
      track(
        'install_command_copied',
        button.closest('.hero') ? 'hero' : 'final_cta',
        'npx_flarecheck'
      )
      window.setTimeout(() => {
        label.textContent = 'Copy'
      }, 1800)
    } catch {
      label.textContent = 'Select command'
    }
  })
}

for (const link of document.querySelectorAll(
  'a[href="https://github.com/marketplace/actions/flarecheck"]'
)) {
  link.addEventListener('click', () => {
    track(
      'marketplace_clicked',
      link.closest('footer') ? 'footer' : 'content',
      'github_marketplace'
    )
  })
}

if (window.location.pathname === '/rules') {
  track('rules_viewed', 'page', 'rule_reference')
}
