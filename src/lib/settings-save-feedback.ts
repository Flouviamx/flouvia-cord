const timers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

/** Called after the actual request outcome; never infers success from a click. */
export function setSaveState(
    button: HTMLButtonElement,
    state: 'saving' | 'saved' | 'error',
    message?: string,
) {
    const previous = timers.get(button);
    if (previous) clearTimeout(previous);
    timers.delete(button);
    button.classList.remove('saving', 'saved');
    if (state !== 'error') button.classList.add(state);
    button.disabled = state === 'saving' || state === 'saved';
    button.setAttribute('aria-busy', String(state === 'saving'));
    const status = button.closest('.settings-save-footer')?.querySelector<HTMLElement>('.s-saved');
    const text = status?.querySelector<HTMLElement>('.s-saved-text');
    if (text) text.textContent = state === 'saving' ? '' : message || button.dataset[state === 'saved' ? 'i18nSaved' : 'i18nErr'] || '';
    if (status) status.className = `s-saved${state === 'saving' ? '' : ' show'}${state === 'error' ? ' error' : ''}`;
    if (state === 'saved') {
        timers.set(button, setTimeout(() => {
            button.classList.remove('saved');
            button.disabled = false;
            status?.classList.remove('show');
            timers.delete(button);
        }, 1800));
    }
}
