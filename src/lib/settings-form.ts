type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Value = string | boolean;
const selector = '[data-field], [data-brand-option], [data-color-for], [data-settings-track]';
const read = (f: Field): Value => f instanceof HTMLInputElement && ['checkbox','radio'].includes(f.type) ? f.checked : f.value;

/** Tracks only explicit manual settings controls. Never persists drafts in browser storage. */
export function initSettingsForm() {
    const root = document.querySelector<HTMLElement>('[data-settings-form]');
    if (!root) return;
    const en = document.documentElement.lang.startsWith('en');
    const fields = Array.from(root.querySelectorAll<Field>(selector)).filter(f => f.type !== 'file');
    const baseline = new Map(fields.map(f => [f, read(f)]));
    const pending = new WeakMap<Element, Map<Field,Value>>();
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.s-block,.be-section,.settings-surface'));
    const changed = (f: Field) => baseline.get(f) !== read(f);
    const notices: Array<{section: HTMLElement; controls: Field[]; bar: HTMLElement; undo: HTMLButtonElement}> = [];
    for (const section of sections) {
        const controls = fields.filter(f => section.contains(f));
        if (!controls.length) continue;
        const bar = document.createElement('div'); bar.className='settings-section-changes'; bar.hidden=true;
        const label=document.createElement('span'); label.textContent=en?'Unsaved changes':'Cambios sin guardar';
        const undo=document.createElement('button'); undo.type='button'; undo.textContent=en?'Undo section':'Deshacer sección';
        undo.addEventListener('click',()=>{
            for (const f of controls) {
                const v=baseline.get(f)!;
                if (typeof v==='boolean') (f as HTMLInputElement).checked=v; else f.value=v;
            }
            for(const f of controls){
                if(f instanceof HTMLInputElement && f.type==='radio' && !f.checked)continue;
                f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));
            }
            sync();
        });
        bar.append(label,undo); section.prepend(bar); notices.push({section,controls,bar,undo});
    }
    const summary=document.createElement('p'); summary.className='settings-pending-summary'; summary.setAttribute('role','status'); summary.hidden=true;
    root.prepend(summary);
    let saving=false;
    function sync() {
        const dirty=fields.some(changed);
        for(const n of notices){ n.bar.hidden=!n.controls.some(changed); n.undo.disabled=saving; }
        summary.hidden=!dirty;
        const count=notices.filter(n=>!n.bar.hidden).length;
        summary.textContent=en?`Unsaved changes${count?` in ${count} section(s)`:''}.`:`Cambios sin guardar${count?` en ${count} sección(es)`:''}.`;
    }
    root.addEventListener('input',sync); root.addEventListener('change',sync);
    root.addEventListener('cord:save-feedback',(event)=>{
        const e=event as CustomEvent<{state:string}>; const button=event.target as HTMLElement;
        const local=button.closest('.s-block,.be-section,.settings-surface');
        const scope=local?fields.filter(f=>local.contains(f)):fields;
        if(e.detail.state==='saving'){pending.set(button,new Map(scope.map(f=>[f,read(f)])));saving=true;}
        else {saving=false;if(e.detail.state==='saved')for(const [f,v] of pending.get(button)??[])baseline.set(f,v);pending.delete(button);}
        sync();
    });
    window.addEventListener('beforeunload',e=>{if(fields.some(changed)){e.preventDefault();e.returnValue='';}});
    root.addEventListener('invalid',event=>{
        const f=event.target as Field; if(!f.matches(selector))return;
        const container=f.closest('.s-field,.be-section')??f.parentElement!;
        let error=container.querySelector<HTMLElement>('[data-field-error]');
        if(!error){error=document.createElement('p');error.dataset.fieldError='';error.className='settings-field-error';error.setAttribute('role','alert');container.append(error);}
        error.textContent=f.validationMessage;f.setAttribute('aria-invalid','true');
    },true);
    root.addEventListener('input',event=>{const f=event.target as Field;if(f.matches(selector)){f.removeAttribute('aria-invalid');f.closest('.s-field,.be-section')?.querySelector('[data-field-error]')?.remove();}});
    const reveal=()=>{
        const hash=decodeURIComponent(location.hash.slice(1)); if(!hash)return;
        let target=document.getElementById(hash) ?? fields.find(f=>f.dataset.field===hash);
        if(target instanceof HTMLInputElement && target.type==='hidden')target=target.closest<HTMLElement>('.s-field,.s-block,.be-section')??target.parentElement??undefined;
        if(!target)return;
        for(let p=target.parentElement;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;
        target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
        target.classList.add('settings-search-target');target.focus({preventScroll:true});
        setTimeout(()=>target.classList.remove('settings-search-target'),3500);
    };
    window.addEventListener('hashchange',reveal);reveal();sync();
}
