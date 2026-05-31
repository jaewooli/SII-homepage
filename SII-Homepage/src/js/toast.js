export function showToast(text, type = 'info') {
  // type: 'success' | 'error' | 'info'
  let el = document.getElementById('toast');
  if (el) {
    el.remove();
  }
  el = document.createElement('div');
  el.id = 'toast';
  el.textContent = text;
  el.className = `toast toast--${type}`;
  document.body.appendChild(el);
  
  // Trigger reflow to run transition
  void el.offsetWidth;
  
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  
  setTimeout(() => { 
    el.style.opacity = '0'; 
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => { 
      if (el.parentNode) el.remove(); 
    }, 300); 
  }, 3000);
}