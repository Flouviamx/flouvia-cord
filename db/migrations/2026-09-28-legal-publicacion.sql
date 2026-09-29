-- 2026-09-28: publicación de Términos y Aviso versión 2026-09-28.

-- Versión 2026-09-28 de Términos y Aviso: integraciones, datos de usuario de
-- Google y plazos de derechos. Publicada por decisión explícita de André el
-- 28 sep 2026; obliga a nueva aceptación personal.
insert into legal_documents
  (doc_id, version, document_type, effective_date, supersedes_version, requires_action, required_action, acceptance_scope)
values
  ('terms',   '2026-09-28', 'terms',   '2026-09-28', '2026-08-11', true, 'accepted',     'personal'),
  ('privacy', '2026-09-28', 'privacy', '2026-09-28', '2026-08-29', true, 'acknowledged', 'personal')
on conflict (doc_id, version) do nothing;

update legal_document_variants
set is_current = false
where doc_id in ('terms', 'privacy') and version <> '2026-09-28' and is_current = true;

insert into legal_document_variants
  (doc_id, version, locale, jurisdiction, artifact_sha256, artifact_route, source_path, status, is_current, published_at)
values
  ('terms',   '2026-09-28', 'es-MX', 'GLOBAL', 'c4cb2d15e207a20144620f7e3ab28e698b561ab5e65cbe916938caf8ee265260', '/terminos',      'src/pages/terminos.astro',   'published', true, '2026-09-28T00:00:00Z'),
  ('terms',   '2026-09-28', 'en-US', 'GLOBAL', 'b01410ff26503b98e6dcba483652b1f47cdd65d0f9795977096f544fae439ddb', '/en/terminos',   'src/pages/terminos.astro',   'published', true, '2026-09-28T00:00:00Z'),
  ('privacy', '2026-09-28', 'es-MX', 'GLOBAL', '1d4eed2370b940fb289f254ae24e06078dc522da5e0f0bbb05b067e4d85d70e3', '/privacidad',    'src/pages/privacidad.astro', 'published', true, '2026-09-28T00:00:00Z'),
  ('privacy', '2026-09-28', 'en-US', 'GLOBAL', 'ec1e0d6f448dc1f2f2e125a88ba8d602bc4d4f4ac6260450d46f09ca72afb44d', '/en/privacidad', 'src/pages/privacidad.astro', 'published', true, '2026-09-28T00:00:00Z')
on conflict (doc_id, version, locale, jurisdiction) do nothing;

update legal_document_variants
set is_current = true
where doc_id in ('terms', 'privacy') and version = '2026-09-28' and is_current = false;

