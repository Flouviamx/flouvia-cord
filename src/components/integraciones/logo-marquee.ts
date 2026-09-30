import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export interface MarqueeTile {
    src: string;
    color: string;
    mode: 'tile' | 'mark';
    href: string;
}

const SPACING = 1.34;
const DEPTH = 0.18;
const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// El glifo blanco sale del logo real: en un logo de cuadro de color se queda lo
// blanco; en uno de varios colores, la silueta de lo que tiene color.
function glyphTexture(img: HTMLImageElement, mode: MarqueeTile['mode']): THREE.CanvasTexture {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const pad = mode === 'tile' ? 0 : S * 0.2;
    ctx.drawImage(img, pad, pad, S - pad * 2, S - pad * 2);
    const data = ctx.getImageData(0, 0, S, S);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
        const mn = Math.min(d[i], d[i + 1], d[i + 2]) / 255;
        const w = mode === 'tile'
            ? smooth(0.62, 0.9, mn) * (1 - smooth(0.12, 0.3, mx - mn))
            : smooth(0.07, 0.22, mx - mn) * (1 - smooth(0.9, 0.98, mn));
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(255 * a * w);
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function faceGradient(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c8c8c8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function shadowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(10,25,47,0.55)');
    g.addColorStop(0.55, 'rgba(10,25,47,0.18)');
    g.addColorStop(1, 'rgba(10,25,47,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

interface Slot {
    group: THREE.Group;
    body: THREE.MeshPhysicalMaterial;
    shadow: THREE.Mesh;
    shadowMat: THREE.MeshBasicMaterial;
    base: number;
    phase: number;
    f: number;
    hover: number;
    href: string;
    color: THREE.Color;
}

export async function mountLogoMarquee(host: HTMLElement, tiles: MarqueeTile[]): Promise<() => void> {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const images = await Promise.all(tiles.map((t) => loadImage(t.src)));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.6;
    room.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-2, 3, 5);
    scene.add(key);
    // Luz que sigue al cursor: una luz de ÁREA (softbox) lejana, tenue y
    // apenas cálida. La puntual de antes, pegada a los tiles y a 4.5, dejaba un
    // manchón blanco redondo en el barniz y deslavaba el color; un área refleja
    // como franja suave, que es como se ve un objeto fotografiado en estudio.
    RectAreaLightUniformsLib.init();
    const cursorLight = new THREE.RectAreaLight(0xfff4ea, 0, 2.6, 1.2);
    cursorLight.position.set(0, 0.6, 3.2);
    cursorLight.lookAt(0, 0, 0);
    scene.add(cursorLight);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const geo = new RoundedBoxGeometry(1, 1, DEPTH, 6, 0.2);
    const plane = new THREE.PlaneGeometry(0.86, 0.86);
    const shadowPlane = new THREE.PlaneGeometry(1.5, 1.5);
    const gradient = faceGradient();
    const shadowTex = shadowTexture();

    const glyphs = tiles.map((t, i) => glyphTexture(images[i], t.mode));
    const slots: Slot[] = [];
    const root = new THREE.Group();
    scene.add(root);
    let loop = 0;

    const build = (count: number) => {
        for (const s of slots) root.remove(s.group, s.shadow);
        slots.length = 0;
        for (let i = 0; i < count; i++) {
            const t = tiles[i % tiles.length];
            const color = new THREE.Color(t.color);
            const body = new THREE.MeshPhysicalMaterial({
                color, map: gradient, roughness: 0.26, metalness: 0.05,
                clearcoat: 1, clearcoatRoughness: 0.08,
                sheen: 0.35, sheenRoughness: 0.35, sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.4),
                iridescence: 0.18, iridescenceIOR: 1.4,
                emissive: color, emissiveIntensity: 0.06,
            });
            const glyph = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({
                color: 0xffffff, map: glyphs[i % tiles.length], transparent: true, roughness: 0.3, metalness: 0,
                emissive: 0xffffff, emissiveIntensity: 0.22, depthWrite: false,
            }));
            glyph.position.z = DEPTH / 2 + 0.003;
            const deboss = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
                color: 0x000000, map: glyphs[i % tiles.length], transparent: true, opacity: 0.1, depthWrite: false,
            }));
            deboss.position.set(0.006, -0.012, DEPTH / 2 + 0.002);
            const group = new THREE.Group();
            group.add(new THREE.Mesh(geo, body), deboss, glyph);
            const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 });
            const shadow = new THREE.Mesh(shadowPlane, shadowMat);
            shadow.position.z = -0.45;
            root.add(shadow, group);
            slots.push({ group, body, shadow, shadowMat, base: i * SPACING, phase: i * 0.83, f: 0, hover: 0, href: t.href, color });
        }
        loop = count * SPACING;
    };

    let visW = 0;
    let visH = 0;
    const resize = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const tilePx = w < 640 ? 64 : 94;
        visH = h / tilePx;
        camera.position.set(0, 0, visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        camera.updateProjectionMatrix();
        visW = visH * camera.aspect;
        const needed = Math.ceil((visW + SPACING * 3) / SPACING);
        const count = Math.max(tiles.length, Math.ceil(needed / tiles.length) * tiles.length);
        if (count !== slots.length) build(count);
    };

    const pointer = { x: 0, y: 0, inside: false, down: false, lastX: 0, moved: 0 };
    const ndc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const toWorld = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        pointer.x = (ndc.x * visW) / 2;
        pointer.y = (ndc.y * visH) / 2;
    };

    let offset = 0;
    let velocity = 0;
    const baseSpeed = reduce ? 0 : 0.55;
    let speed = baseSpeed;
    let hovered: Slot | null = null;

    const onMove = (e: PointerEvent) => {
        toWorld(e);
        pointer.inside = true;
        if (pointer.down) {
            const dx = e.clientX - pointer.lastX;
            pointer.lastX = e.clientX;
            pointer.moved += Math.abs(dx);
            const unitsPerPx = visW / canvas.clientWidth;
            offset += dx * unitsPerPx;
            velocity = (dx * unitsPerPx) * 60;
        }
    };
    const onDown = (e: PointerEvent) => {
        pointer.down = true;
        pointer.lastX = e.clientX;
        pointer.moved = 0;
        toWorld(e);
    };
    const onUp = () => { pointer.down = false; };
    const onLeave = () => { pointer.inside = false; pointer.down = false; };
    const onClick = () => {
        if (pointer.moved > 6 || !hovered) return;
        window.location.href = hovered.href;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointercancel', onLeave);
    canvas.addEventListener('click', onClick);

    const clock = new THREE.Clock();
    let running = false;
    let raf = 0;
    const wrap = (x: number) => ((x % loop) + loop) % loop - loop / 2;

    const frame = () => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(clock.getDelta(), 1 / 20);
        const t = clock.elapsedTime;
        const targetSpeed = pointer.inside ? baseSpeed * 0.22 : baseSpeed;
        speed += (targetSpeed - speed) * Math.min(1, dt * 3);
        if (!pointer.down) {
            offset -= speed * dt;
            offset += velocity * dt;
            velocity *= Math.pow(0.04, dt);
        }

        raycaster.setFromCamera(ndc, camera);
        const hits = pointer.inside ? raycaster.intersectObjects(slots.map((s) => s.group), true) : [];
        let hit: Slot | null = null;
        if (hits.length) {
            const obj = hits[0].object.parent;
            hit = slots.find((s) => s.group === obj) ?? null;
        }
        hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : pointer.down ? 'grabbing' : 'grab';

        cursorLight.position.x += (pointer.x - cursorLight.position.x) * Math.min(1, dt * 8);
        cursorLight.position.y += (pointer.y + 0.6 - cursorLight.position.y) * Math.min(1, dt * 8);
        cursorLight.intensity += ((pointer.inside ? 2.4 : 0) - cursorLight.intensity) * Math.min(1, dt * 3);
        cursorLight.lookAt(cursorLight.position.x, cursorLight.position.y - 0.6, 0);

        for (const s of slots) {
            const x = wrap(s.base + offset);
            const dx = pointer.x - x;
            const dy = pointer.y;
            const near = pointer.inside ? Math.exp(-(dx * dx) / 1.3) : 0;
            s.f += (near - s.f) * Math.min(1, dt * 6);
            s.hover += ((s === hit ? 1 : 0) - s.hover) * Math.min(1, dt * 8);
            const idle = reduce ? 0 : 1;
            const g = s.group;
            g.position.x = x;
            g.position.y = Math.sin(t * 0.9 + s.phase) * 0.045 * idle + s.f * 0.06;
            g.position.z = s.f * 0.42 + s.hover * 0.18;
            g.rotation.y = THREE.MathUtils.clamp(dx * 0.55, -0.7, 0.7) * s.f + Math.sin(t * 0.55 + s.phase) * 0.12 * idle;
            g.rotation.x = -THREE.MathUtils.clamp(dy * 0.6, -0.6, 0.6) * s.f + Math.cos(t * 0.7 + s.phase) * 0.07 * idle;
            g.rotation.z = Math.sin(t * 0.4 + s.phase) * 0.03 * idle;
            g.scale.setScalar(1 + s.f * 0.08 + s.hover * 0.06);
            s.body.emissiveIntensity = 0.06 + s.hover * 0.06;
            s.shadow.position.set(x + 0.04, g.position.y - 0.16 - s.f * 0.1, -0.45);
            s.shadow.scale.setScalar(1 + s.f * 0.35);
            s.shadowMat.opacity = 0.42 - s.f * 0.16;
        }
        renderer.render(scene, camera);
    };

    const start = () => {
        if (running) return;
        running = true;
        clock.getDelta();
        raf = requestAnimationFrame(frame);
    };
    const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    let visible = false;
    const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !document.hidden) start(); else stop();
    });
    io.observe(host);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
        stop();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pointerup', onUp);
        renderer.dispose();
        canvas.remove();
    };
}
