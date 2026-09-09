import assert from 'node:assert/strict';

// Deliberately bounded to this audited migration, not a general SQL parser.
// Dollar-quoted function/DO bodies must stay intact across statement separators.
export function customerDomainStatements(source) {
  const parts = source.replace(/^\s*--[^\n]*$/gm, '').split(/(\$\$[\s\S]*?\$\$)/);
  const statements = [];
  let pending = '';
  for (const part of parts) {
    if (part.startsWith('$$')) { pending += part; continue; }
    assert.ok(!part.includes('$$'), 'Unclosed dollar-quoted SQL');
    for (const [i, chunk] of part.split(';').entries()) {
      if (i) { if (pending.trim()) statements.push(pending.trim()); pending = ''; }
      pending += chunk;
    }
  }
  assert.equal(pending.trim(), '', 'Migration must end with a semicolon');
  const expected = [
    /^create table if not exists org_domains\s*\(/,
    /^alter table org_domains enable row level security$/,
    /^alter table org_domains force row level security$/,
    /^drop policy if exists org_domains_tenant on org_domains$/,
    /^create policy org_domains_tenant on org_domains\s/,
    /^create or replace function cord_resolve_customer_domain\(p_hostname text\)/,
    /^revoke all on function cord_resolve_customer_domain\(text\) from public$/,
    /^do \$\$ begin\s/,
  ];
  assert.equal(statements.length, expected.length, 'Unexpected migration scope; review before applying');
  statements.forEach((s, i) => assert.match(s, expected[i]));
  return statements;
}
