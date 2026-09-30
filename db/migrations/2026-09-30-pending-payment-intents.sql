-- 2026-09-30: la sonda de confirmación de pagos deja de confundir "el cliente
-- no ha pagado" con "Stripe no nos avisa". Esta función le da los cobros
-- pendientes más recientes para verificarlos contra Stripe.
-- Los cobros pendientes más recientes con su PaymentIntent y la cuenta conectada
-- donde vive. Lo usa la sonda de "confirmación de pagos" para preguntarle a
-- Stripe si alguno ya se cobró sin que Cord lo registrara: un cobro pendiente
-- casi siempre es un cliente que no ha pagado, y eso no es una caída.
create or replace function cord_pending_payment_intents(p_limit int default 10)
returns table (payment_intent text, stripe_account text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.stripe_payment_intent_id, o.stripe_account_id
    from cotizacion_cobros c join orgs o on o.id = c.org_id
   where c.status = 'pendiente' and c.stripe_payment_intent_id is not null
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;

revoke all on function cord_pending_payment_intents(int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'cord_app') then
    grant execute on function cord_pending_payment_intents(int) to cord_app;
  end if;
end $$;
