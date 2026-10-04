const preview = document.querySelector('#preview');
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    const pixel = button.dataset.view === 'pixel';
    preview.src = `assets/aurora-${pixel ? 'pixel' : 'original'}.jpg`;
    preview.alt = pixel ? 'Recorded Pixel Web conversion of Aurora Survival' : 'Original-view capture of Aurora Survival from the same converter session';
    document.querySelector('#preview-caption').textContent = `${pixel ? 'Pixel' : 'Original'} view · Recorded from the local converter.`;
    for (const control of document.querySelectorAll('[data-view]')) control.setAttribute('aria-pressed', String(control === button));
  });
}
