var AnyaToast = {}

AnyaToast.show = function(message, type) {
  type = type || 'info'
  var container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    document.body.appendChild(container)
  }

  var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' }

  var el = document.createElement('div')
  el.className = 'toast toast-' + type
  el.innerHTML =
    '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span>' +
    '<span class="toast-message">' + message.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
    '<span class="toast-close">✕</span>'

  container.appendChild(el)

  el.querySelector('.toast-close').onclick = function() { remove() }

  var timeout = setTimeout(remove, 4000)

  function remove() {
    clearTimeout(timeout)
    if (el.classList.contains('toast-out')) return
    el.classList.add('toast-out')
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el)
    }, 250)
  }

  el.onclick = function(e) {
    if (e.target === el || e.target.classList.contains('toast-message')) {
      remove()
    }
  }
}

AnyaToast.success = function(msg) { AnyaToast.show(msg, 'success') }
AnyaToast.error = function(msg) { AnyaToast.show(msg, 'error') }
AnyaToast.info = function(msg) { AnyaToast.show(msg, 'info') }
AnyaToast.warning = function(msg) { AnyaToast.show(msg, 'warning') }
