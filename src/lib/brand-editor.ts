import { DEFAULT_BRAND, resolveBrandProfile, brandColor, onBrandColor } from './brand-profile';

export function initBrandEditor() {
    const root = document.getElementById('brandEditor');
    if (!root) return;
    const config = root.querySelector<HTMLInputElement>('#brandProfile')!;
    const frame = root.querySelector<HTMLIFrameElement>('#brandPreview')!;
    const undo = root.querySelector<HTMLButtonElement>('#brandUndo')!;
    const error = root.querySelector<HTMLElement>('#brandError')!;
    const en = root.dataset.locale === 'en';
    const stage = root.querySelector<HTMLElement>('.be-preview-stage')!;
    const resizePreview = () => {
        const available = stage.clientWidth - 20;
        const width = stage.dataset.size === 'mobile' && surface!=='pdf' ? 375 : surface==='pdf'?820:760;
        const scale = Math.min(1, available / width);
        frame.style.width = `${width}px`;
        frame.style.height = `${(stage.clientHeight - 20) / scale}px`;
        frame.style.transform = `scale(${scale})`;
        frame.style.marginLeft = `${Math.max(0,(available-width*scale)/2)}px`;
    };
    new ResizeObserver(resizePreview).observe(stage);
    const fields = () => Array.from(root.querySelectorAll<HTMLInputElement>('[data-field]'));
    const snapshot = () => Object.fromEntries(fields().map((el) => [el.dataset.field!, el.type === 'checkbox' ? el.checked : el.value]));
    let saved = snapshot();
    let profile = resolveBrandProfile(JSON.parse(config.value));
    let uploadRevision = 0;
    let comparingSaved=false;
    let surface='portal';
    const value = (selector: string, fallback = '') => root.querySelector<HTMLInputElement>(selector)?.value ?? fallback;
    const notify = () => config.dispatchEvent(new Event('input', { bubbles: true }));
    const showError = (message = '') => { error.textContent = message; error.hidden = !message; };
    const update = () => {
        const primary = brandColor(value('#brandPrimary', root.dataset.primary));
        const secondary = value('#brandSecondary', root.dataset.secondary);
        const logo = value('#brandLogo', root.dataset.logo);
        root.style.setProperty('--be-primary', primary);
        root.style.setProperty('--be-on-primary', onBrandColor(primary));
        const state=comparingSaved?saved:snapshot();
        frame.contentWindow?.postMessage({type:'cord:brand-preview',
            profile:resolveBrandProfile(JSON.parse(String(state.brand_profile||config.value))),
            primary:state.color_marca ?? root.dataset.primary,secondary:state.color_secundario ?? root.dataset.secondary,
            logo:state.logo_url ?? root.dataset.logo,banner:state.portal_banner ?? root.dataset.banner,
            welcome:state.portal_bienvenida ?? root.dataset.welcome,chat:state.portal_mostrar_chat ?? root.dataset.chat==='true',
            powered:state.portal_powered ?? root.dataset.powered==='true'},location.origin);

        for (const kind of ['primary','dark']) {
            const url = kind === 'dark' ? profile.logoDark : logo;
            const img = root.querySelector<HTMLImageElement>(`[data-logo-img="${kind}"]`);
            if (img) { if (url) img.src=url; else img.removeAttribute('src'); img.hidden=!url; }
            const fallback = root.querySelector<HTMLElement>(`[data-logo-fallback="${kind}"]`);
            if (fallback) fallback.hidden=!!url;
        }
        for (const swatch of root.querySelectorAll<HTMLInputElement>('[data-color-for]')) swatch.value = brandColor(value(`#${swatch.dataset.colorFor}`),primary);
        for (const button of root.querySelectorAll<HTMLButtonElement>('[data-palette]')) button.setAttribute('aria-pressed',String(button.dataset.palette===`${primary.toLowerCase()},${secondary.toLowerCase()}`));
        undo.disabled = JSON.stringify(snapshot()) === JSON.stringify(saved);
    };
    const syncOptions = () => {
        for (const el of root.querySelectorAll<HTMLInputElement>('[data-brand-option]')) {
            const v = profile[el.dataset.brandOption as keyof typeof profile];
            if (el.type === 'radio') el.checked = el.value === v; else el.value = v;
        }
        config.value = JSON.stringify(profile);
    };
    root.addEventListener('input', (event) => {
        const el = event.target as HTMLInputElement;
        if (el.dataset.brandOption) {
            profile = resolveBrandProfile({...profile,[el.dataset.brandOption]:el.value});
            config.value = JSON.stringify(profile);
        }
        if (el.dataset.colorFor) {
            const input = document.getElementById(el.dataset.colorFor) as HTMLInputElement;
            input.value = el.value;
        }
        update();
    });
    root.addEventListener('change', update);
    root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => button.addEventListener('click', () => {
        const [a,b] = button.dataset.palette!.split(',');
        root.querySelector<HTMLInputElement>('#brandPrimary')!.value=a;
        root.querySelector<HTMLInputElement>('#brandSecondary')!.value=b;
        notify();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-preview-size]').forEach((button) => button.addEventListener('click', () => {
        stage.dataset.size=button.dataset.previewSize;
        resizePreview();
        root.querySelectorAll('[data-preview-size]').forEach((b) => b.setAttribute('aria-pressed',String(b===button)));
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-brand-compare]').forEach(button=>button.addEventListener('click',()=>{
        comparingSaved=button.dataset.brandCompare==='saved';
        root.querySelectorAll('[data-brand-compare]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-brand-surface-view]').forEach(button=>button.addEventListener('click',()=>{
        surface=button.dataset.brandSurfaceView!;
        const urls:Record<string,string>={portal:'/app/ajustes/marca-preview',quote:'/app/ajustes/marca-preview?view=quote',pdf:'/app/ajustes/documento-preview',email:'/app/ajustes/correo-preview'};
        frame.src=urls[surface];
        frame.title=button.textContent||'';
        root.querySelectorAll('[data-brand-surface-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));resizePreview();
    }));
    root.querySelector('#brandReset')?.addEventListener('click', () => {
        ++uploadRevision;
        profile = {...DEFAULT_BRAND,logoDark:profile.logoDark};
        syncOptions(); showError(); notify();
    });
    undo.addEventListener('click', () => {
        ++uploadRevision;
        for (const el of fields()) {
            const v = saved[el.dataset.field!];
            if (el.type === 'checkbox') el.checked=!!v; else el.value=String(v);
        }
        root.querySelectorAll<HTMLInputElement>('[type=file]').forEach((el) => el.value='');
        profile=resolveBrandProfile(JSON.parse(config.value)); syncOptions(); showError(); notify();
    });
    document.addEventListener('cord:settings-saved', (event) => {
        const body = (event as CustomEvent<Record<string, unknown>>).detail;
        for (const key of Object.keys(saved)) if (body[key] !== undefined) saved[key]=body[key] as string | boolean;
        update();
    });
    root.querySelectorAll<HTMLInputElement>('[data-logo-file]').forEach((input) => input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        const revision = ++uploadRevision;
        if (!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type) || file.size > 1_000_000) {
            showError(en?'Choose a PNG, JPG, SVG or WEBP under 1 MB.':'Elige un PNG, JPG, SVG o WEBP de hasta 1 MB.'); input.value=''; return;
        }
        try {
            const data = await new Promise<string>((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=reject; reader.readAsDataURL(file); });
            const img = new Image(); img.src=data; await img.decode();
            if (revision !== uploadRevision) return;
            if (input.dataset.logoFile==='dark') { profile={...profile,logoDark:data}; syncOptions(); }
            else root.querySelector<HTMLInputElement>('#brandLogo')!.value=data;
            showError(); notify();
        } catch { showError(en?'This image could not be read. Try another file.':'No se pudo leer esta imagen. Prueba con otro archivo.'); }
        input.value='';
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-logo-remove]').forEach((button) => button.addEventListener('click', () => {
        ++uploadRevision;
        if (button.dataset.logoRemove==='dark') { profile={...profile,logoDark:''}; syncOptions(); }
        else root.querySelector<HTMLInputElement>('#brandLogo')!.value='';
        showError(); notify();
    }));
    window.addEventListener('message',(event) => {
        if (event.origin===location.origin && event.source===frame.contentWindow && ['cord:brand-preview-ready','cord:pdf-preview-ready','cord:email-preview-ready'].includes(event.data?.type)) update();
    });
    frame.addEventListener('load',update);
    update();
}
