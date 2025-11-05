export function showToast(text, type = 'info') {
  // type: 'success' | 'error' | 'info'
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = `toast toast--${type}`;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.remove(); }, 500); }, 2000);
}