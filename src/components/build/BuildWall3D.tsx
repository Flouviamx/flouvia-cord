import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { PublicLang } from '../../i18n/utils';
import { buildText } from '../../i18n/build';

type Position = {
  id: string;
  tier: string;
  price: string;
  startingOfferCents: number;
  size: 'principal' | 'feature' | 'build';
  label: string;
};

type PublicPosition = {
  id: string;
  tier: string;
  status: 'open' | 'closed' | 'paused';
  currentOfferCents: number | null;
  nextOfferCents: number;
  minIncrementCents: number;
  bidDepositCents?: number;
  currentBrand: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  bidCount: number;
};

type AuctionResponse = {
  auction?: { status: string; endsAt: string };
  positions?: PublicPosition[];
  history?: unknown[];
  committedAmountCents?: number;
};

const placements = [
  { x: 10, y: 18, rest: -2.2, delay: -.8 },
  { x: 30, y: 21, rest: 1.4, delay: -1.6 },
  { x: 50, y: 23, rest: -1.1, delay: -2.7 },
  { x: 70, y: 21, rest: 2.1, delay: -.3 },
  { x: 90, y: 18, rest: -.9, delay: -2.1 },
  { x: 10, y: 54, rest: 1.8, delay: -1.2 },
  { x: 30, y: 57, rest: -1.6, delay: -2.4 },
  { x: 50, y: 59, rest: .9, delay: -.5 },
  { x: 70, y: 57, rest: -2, delay: -1.9 },
  { x: 90, y: 54, rest: 1.2, delay: -2.9 },
] as const;

export default function BuildWall3D({ positions, lang = 'es' }: { positions: readonly Position[]; lang?: PublicLang }) {
  const t = buildText(lang);
  const [activeId, setActiveId] = useState('01');
  const [publicPositions, setPublicPositions] = useState<Record<string, PublicPosition>>({});
  const surface = useRef<HTMLDivElement>(null);
  const activeRef = useRef('01');
  const windFrame = useRef(0);
  const lastPointer = useRef<number | null>(null);
  const springs = useRef(placements.map(() => ({ angle: 0, velocity: 0 })));

  const select = (position: Position, state = publicPositions[position.id]) => {
    setActiveId(position.id);
    activeRef.current = position.id;
    window.dispatchEvent(new CustomEvent('build-position-select', {
      detail: { ...position, ...state },
    }));
  };

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let latest: AuctionResponse | null = null;
    let controller: AbortController | null = null;
    const publish = (data: AuctionResponse) => {
      const next = Object.fromEntries((data.positions || []).map((item) => [item.id, item]));
      setPublicPositions(next);
      // Publish the snapshot first: the selected detail must use its payment gate.
      window.dispatchEvent(new CustomEvent('build-auction-update', { detail: data }));
      const selected = positions.find((position) => position.id === activeRef.current) || positions[0];
      if (selected) select(selected, next[selected.id]);
    };
    const refresh = async () => {
      if (disposed || inFlight || document.hidden) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch('/api/build/payment-intent', {
          headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('auction unavailable');
        const data: AuctionResponse = await response.json();
        if (!data.auction || !Array.isArray(data.history) || !Array.isArray(data.positions)
          || data.positions.length !== positions.length
          || !positions.every((position) => data.positions!.some((item) => item.id === position.id
            && Number.isSafeInteger(item.nextOfferCents) && item.nextOfferCents > 0
            && Number.isSafeInteger(item.bidDepositCents) && Number(item.bidDepositCents) > 0))) {
          throw new Error('incomplete auction snapshot');
        }
        if (disposed) return;
        latest = data;
        publish(data);
      } catch {
        if (!disposed) {
          latest = null;
          window.dispatchEvent(new CustomEvent('build-auction-error'));
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    };
    const replay = () => latest ? publish(latest) : void refresh();
    void refresh();
    const interval = window.setInterval(refresh, 12000);
    window.addEventListener('build-auction-refresh', refresh);
    window.addEventListener('build-auction-ready', replay);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener('build-auction-refresh', refresh);
      window.removeEventListener('build-auction-ready', replay);
      document.removeEventListener('visibilitychange', refresh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  useEffect(() => {
    const handleRequestedPosition = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const position = positions.find((item) => item.id === id);
      if (position) select(position);
    };
    window.addEventListener('build-position-request', handleRequestedPosition);
    return () => window.removeEventListener('build-position-request', handleRequestedPosition);
  // Public auction state is intentionally part of the closure so ledger clicks
  // always open the latest verified minimum and owner.
  }, [positions, publicPositions]);

  useEffect(() => () => cancelAnimationFrame(windFrame.current), []);

  const handleWind = (event: PointerEvent<HTMLDivElement>) => {
    const node = surface.current;
    if (!node || event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = node.getBoundingClientRect();
    const impulse = Math.max(-3, Math.min(3, (event.clientX - (lastPointer.current ?? event.clientX)) * .09));
    lastPointer.current = event.clientX;
    springs.current.forEach((spring, index) => {
      const dx = event.clientX - bounds.left - bounds.width * placements[index].x / 100;
      const dy = event.clientY - bounds.top - bounds.height * placements[index].y / 100;
      spring.velocity += impulse * Math.exp(-(dx * dx + dy * dy) / 90000);
    });
    if (windFrame.current) return;
    let previous = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(2, (now - previous) / 16.667);
      previous = now;
      let moving = false;
      const marks = node.querySelectorAll<HTMLElement>('.cord-mark-anchor');
      springs.current.forEach((spring, index) => {
        spring.velocity = (spring.velocity - spring.angle * .045 * dt) * Math.pow(.91, dt);
        spring.angle = Math.max(-15, Math.min(15, spring.angle + spring.velocity * dt));
        moving ||= Math.abs(spring.angle) > .02 || Math.abs(spring.velocity) > .02;
        marks[index]?.style.setProperty('--item-wind', `${spring.angle.toFixed(3)}deg`);
      });
      windFrame.current = moving ? requestAnimationFrame(animate) : 0;
    };
    windFrame.current = requestAnimationFrame(animate);
  };

  const calmWind = () => {
    lastPointer.current = null;
  };

  return (
    <div
      ref={surface}
      className="cord-flow"
      aria-label={t('Dos cordones interactivos con diez posiciones para marcas')}
      onPointerMove={handleWind}
      onPointerLeave={calmWind}
    >
      <svg className="clotheslines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="cord-line" x1="0" x2="1">
            <stop offset="0" stopColor="#07162a" />
            <stop offset=".55" stopColor="#122b47" />
            <stop offset="1" stopColor="#07162a" />
          </linearGradient>
          <filter id="cord-shadow" x="-10%" width="120%" y="-80%" height="260%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0a192f" floodOpacity=".16" />
          </filter>
        </defs>
        <path className="cord-shadow-line" d="M -20 105 Q 500 155 1020 105" />
        <path className="cord-main-line" d="M -20 105 Q 500 155 1020 105" />
        <path className="cord-highlight-line" d="M -20 102 Q 500 152 1020 102" />
        <path className="cord-shadow-line" d="M -20 328 Q 500 378 1020 328" />
        <path className="cord-main-line" d="M -20 328 Q 500 378 1020 328" />
        <path className="cord-highlight-line" d="M -20 325 Q 500 375 1020 325" />
      </svg>

      <div className="cord-marks">
        {positions.map((position, index) => {
          const state = publicPositions[position.id];
          const placement = placements[index];
          const isActive = position.id === activeId;
          const commonStyle = {
            '--spot-x': `${placement.x}%`,
            '--spot-y': `${((index < 5 ? 105 : 328) + 100 * (placement.x + 2) / 104 * (1 - (placement.x + 2) / 104)) / 620 * 100}%`,
            '--spot-rest': `${placement.rest}deg`,
            '--spot-delay': `${placement.delay}s`,
            '--spot-index': index,
          } as CSSProperties;
          const content = state?.logoUrl ? (
            <img src={state.logoUrl} alt={`${state.currentBrand || t('marca partner')} logo`} />
          ) : (
            <span className="cord-mark-empty" aria-hidden="true"><i></i></span>
          );

          return (
            <div key={position.id} className="cord-mark-anchor" style={commonStyle}>
              <span className="cord-clip" aria-hidden="true"></span>
              {state?.logoUrl && state.websiteUrl ? (
                <a
                  className={`cord-mark ${isActive ? 'is-active' : ''}`}
                  href={state.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  title={`${lang === 'en' ? 'Visit' : 'Visitar'} ${state.currentBrand || t('marca partner')}`}
                >
                  {content}
                </a>
              ) : (
                <button
                  className={`cord-mark ${isActive ? 'is-active' : ''}`}
                  type="button"
                  disabled={state?.status === 'closed'}
                  aria-pressed={isActive}
                  aria-label={`${state?.currentBrand || t('Posición disponible')} · ${lang === 'en' ? 'spot' : 'posición'} ${position.id}`}
                  title={state?.currentBrand || `${t('Ver posición')} ${position.id}`}
                  data-flow-position={position.id}
                  onClick={() => select(position)}
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
