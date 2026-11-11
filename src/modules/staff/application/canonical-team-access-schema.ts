import { sql } from "drizzle-orm";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const invitation = "organization_member_invitations";
const scopes = "organization_member_invitation_scopes";
const receipts = "organization_team_command_receipts";
const unavailable = () => new OperationalError("FEATURE_NOT_AVAILABLE", "El acceso de equipo no está disponible. Inténtalo más tarde.", 503);

type Column = { name: string; typeSchema: string; typeName: string; notNull: boolean; typeModifier: number; defaultExpression: string | null };
type Constraint = { kind: string; columns: string[]; validated: boolean; deferrable: boolean; deferred: boolean; expression: string | null; foreignSchema: string | null; foreignTable: string | null; foreignColumns: string[]; updateAction: string; deleteAction: string; match: string };
type Index = { columns: string[]; unique: boolean; primary: boolean; valid: boolean; ready: boolean; immediate: boolean; live: boolean; nullsNotDistinct: boolean; method: string; predicate: string | null; expression: string | null; keyCount: number; columnCount: number; options: number[]; operatorClasses: string[] };
type Table = { name: string; kind: string; rls: boolean; forceRls: boolean; policies: number; unsafeAcl: boolean; unsafeEnforcement: boolean; columns: Column[]; constraints: Constraint[]; indexes: Index[] };

/**
 * Parse the small SQL expression grammar used by the reviewed candidate. This
 * compares expression structure (including AND/OR precedence), not constraint
 * names or a whitespace/parenthesis-stripped string. Unknown syntax fails shut.
 * Only harmless literal casts to the candidate's exact scalar types normalize.
 */
export function canonicalTeamSchemaExpression(expression: string): string {
  const tokens: string[] = [];
  const lexer = /\s+|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.]*|[0-9]+|::|>=|<=|<>|!=|[()[\],=~<>+-]/gy;
  let position = 0;
  while (position < expression.length) {
    lexer.lastIndex = position;
    const token = lexer.exec(expression);
    if (!token) throw unavailable();
    position = lexer.lastIndex;
    if (!/^\s+$/.test(token[0])) tokens.push(token[0]);
  }
  let cursor = 0;
  type Node = { kind: string; value?: string; children?: Node[] };
  const peek = () => tokens[cursor]?.toLowerCase();
  const consume = (expected?: string) => {
    const value = tokens[cursor++];
    if (value === undefined || (expected && value.toLowerCase() !== expected)) throw unavailable();
    return value;
  };
  function primary(): Node {
    let node: Node;
    if (peek() === "(") { consume("("); node = parse(0); consume(")"); }
    else {
      const value = consume();
      if (value.startsWith("'")) node = { kind: "literal", value: value.slice(1, -1).replaceAll("''", "'") };
      else if (/^[0-9]+$/.test(value)) node = { kind: "number", value };
      else if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)) {
        const name = value.toLowerCase();
        if ((name === "array" && peek() === "[") || peek() === "(") {
          const close = name === "array" ? "]" : ")";
          consume(name === "array" ? "[" : "(");
          const children: Node[] = [];
          if (peek() !== close) do {
            children.push(parse(0));
            if (peek() !== ",") break;
            consume(",");
          } while (true);
          consume(close);
          node = { kind: name === "array" ? "array" : `call:${name}`, children };
        } else node = { kind: "identifier", value: name };
      } else throw unavailable();
    }
    while (peek() === "::") {
      consume("::");
      const type = consume().toLowerCase();
      let array = false;
      if (peek() === "[") { consume("["); consume("]"); array = true; }
      if (!["text", "pg_catalog.text", "zaltyko.member_role"].includes(type)) throw unavailable();
      if (array && node.kind === "literal" && /^\{[a-z_,]+\}$/.test(node.value ?? "")) {
        node = { kind: "array", children: node.value!.slice(1, -1).split(",").map(value => ({ kind: "literal", value })) };
      } else if (array ? node.kind !== "array" : node.kind !== "literal") throw unavailable();
    }
    return node;
  }
  function parse(minimum: number): Node {
    let left = primary();
    while (true) {
      const operator = peek();
      const precedence = operator === "or" ? 1 : operator === "and" ? 2 : ["=", ">", "<", ">=", "<=", "~", "is"].includes(operator ?? "") ? 3 : -1;
      if (precedence < minimum) break;
      consume();
      if (operator === "is") {
        const negated = peek() === "not";
        if (negated) consume("not");
        consume("null"); left = { kind: negated ? "is-not-null" : "is-null", children: [left] };
      } else {
        const right = parse(precedence + 1);
        left = { kind: operator!, children: [left, right] };
      }
    }
    return left;
  }
  const result = parse(0);
  if (cursor !== tokens.length) throw unavailable();
  return JSON.stringify(result);
}

const col = (name: string, typeName: string, notNull = true, defaultExpression: string | null = null): Column => ({ name, typeSchema: typeName === "member_role" ? "zaltyko" : "pg_catalog", typeName, notNull, typeModifier: -1, defaultExpression });
const uuid = (name: string, notNull = true) => col(name, "uuid", notNull);
const timestamp = (name: string, notNull = true, defaults = false) => col(name, "timestamptz", notNull, defaults ? "now()" : null);
const id = () => col("id", "uuid", true, "gen_random_uuid()");
const baseConstraint = { validated: true, deferrable: false, deferred: false, expression: null, foreignSchema: null, foreignTable: null, foreignColumns: [], updateAction: " ", deleteAction: " ", match: " " };
const key = (kind: "p" | "u", columns: string[]): Constraint => ({ ...baseConstraint, kind, columns });
const check = (expression: string): Constraint => ({ ...baseConstraint, kind: "c", columns: [], expression });
const foreign = (columns: string[], foreignTable: string, foreignColumns: string[], deleteAction = "a", foreignSchema = "zaltyko"): Constraint => ({ ...baseConstraint, kind: "f", columns, foreignSchema, foreignTable, foreignColumns, updateAction: "a", deleteAction, match: "s" });
const index = (columns: string[], unique: boolean, primary = false, predicate: string | null = null): Index => ({ columns, unique, primary, predicate, valid: true, ready: true, immediate: true, live: true, nullsNotDistinct: false, method: "btree", expression: null, keyCount: columns.length, columnCount: columns.length, options: columns.map(() => 0), operatorClasses: columns.map(column => `pg_catalog.${["normalized_email", "idempotency_key", "token_sha256"].includes(column) ? "text_ops" : "uuid_ops"}`) });
const enumSet = (column: string, values: string[], type = "text") => `${column} = ANY (ARRAY[${values.map(value => `'${value}'::${type}`).join(",")}])`;

/**
 * Exact reviewed candidate (phase one plus the O3 team-profile link); any
 * structural addition needs review.
 */
const manifest = [
  {
    name: invitation,
    columns: [id(), uuid("organization_id"), col("normalized_email", "text"), col("role", "member_role"), col("status", "text", true, "'pending'::text"), uuid("invited_by_member_id"), col("token_sha256", "text"), timestamp("expires_at"), col("revision", "int4", true, "1"), uuid("staff_profile_id", false), col("invitee_given_name", "text", false), col("invitee_family_name", "text", false), uuid("accepted_by_user_id", false), uuid("accepted_member_id", false), timestamp("accepted_at", false), uuid("revoked_by_member_id", false), timestamp("revoked_at", false), timestamp("created_at", true, true), timestamp("updated_at", true, true)],
    constraints: [key("p", ["id"]), key("u", ["token_sha256"]), key("u", ["organization_id", "id"]),
      foreign(["organization_id"], "organizations", ["id"], "c"), foreign(["accepted_by_user_id"], "users", ["id"], "a", "auth"),
      foreign(["organization_id", "invited_by_member_id"], "organization_members", ["organization_id", "id"]), foreign(["organization_id", "accepted_member_id"], "organization_members", ["organization_id", "id"]), foreign(["organization_id", "revoked_by_member_id"], "organization_members", ["organization_id", "id"]),
      foreign(["organization_id", "staff_profile_id"], "staff_profiles", ["organization_id", "id"]),
      check("(staff_profile_id IS NOT NULL AND invitee_given_name IS NULL AND invitee_family_name IS NULL) OR (staff_profile_id IS NULL AND invitee_given_name IS NOT NULL AND invitee_family_name IS NOT NULL)"),
      check("invitee_given_name IS NULL OR (length(btrim(invitee_given_name)) >= 1 AND length(btrim(invitee_given_name)) <= 100)"),
      check("invitee_family_name IS NULL OR (length(btrim(invitee_family_name)) >= 1 AND length(btrim(invitee_family_name)) <= 100)"),
      check("normalized_email = lower(btrim(normalized_email)) AND length(normalized_email) >= 3 AND length(normalized_email) <= 254 AND strpos(normalized_email,'@'::text) > 1"),
      check(enumSet("role", ["manager", "coach"], "zaltyko.member_role")), check(enumSet("status", ["pending", "accepted", "revoked"])), check("token_sha256 ~ '^[0-9a-f]{64}$'::text"), check("revision > 0"),
      check("(status='pending' AND accepted_by_user_id IS NULL AND accepted_member_id IS NULL AND accepted_at IS NULL AND revoked_by_member_id IS NULL AND revoked_at IS NULL) OR (status='accepted' AND accepted_by_user_id IS NOT NULL AND accepted_member_id IS NOT NULL AND accepted_at IS NOT NULL AND revoked_by_member_id IS NULL AND revoked_at IS NULL) OR (status='revoked' AND accepted_by_user_id IS NULL AND accepted_member_id IS NULL AND accepted_at IS NULL AND revoked_by_member_id IS NOT NULL AND revoked_at IS NOT NULL)")],
    indexes: [index(["id"], true, true), index(["token_sha256"], true), index(["organization_id", "id"], true), index(["organization_id", "normalized_email"], true, false, "status='pending'::text"), index(["organization_id", "id"], false)],
  },
  {
    name: scopes,
    columns: [id(), uuid("organization_id"), uuid("invitation_id"), uuid("location_id"), timestamp("created_at", true, true)],
    constraints: [key("p", ["id"]), key("u", ["organization_id", "invitation_id", "location_id"]), foreign(["organization_id"], "organizations", ["id"], "c"), foreign(["organization_id", "invitation_id"], invitation, ["organization_id", "id"], "c"), foreign(["organization_id", "location_id"], "locations", ["organization_id", "id"])],
    indexes: [index(["id"], true, true), index(["organization_id", "invitation_id", "location_id"], true)],
  },
  {
    name: receipts,
    columns: [id(), uuid("organization_id"), uuid("actor_user_id"), col("idempotency_key", "text"), col("operation", "text"), col("request_hash", "text"), uuid("invitation_id"), col("invitation_status", "text"), col("invitation_revision", "int4"), timestamp("invitation_expires_at"), uuid("member_id", false), timestamp("created_at", true, true)],
    constraints: [key("p", ["id"]), key("u", ["organization_id", "actor_user_id", "idempotency_key"]), foreign(["organization_id"], "organizations", ["id"], "c"), foreign(["actor_user_id"], "users", ["id"], "a", "auth"), foreign(["organization_id", "invitation_id"], invitation, ["organization_id", "id"]), foreign(["organization_id", "member_id"], "organization_members", ["organization_id", "id"]), check("idempotency_key ~ '^[0-9a-f]{64}$'::text"), check(enumSet("operation", ["invite", "reissue", "revoke", "accept"])), check("request_hash ~ '^[0-9a-f]{64}$'::text"), check(enumSet("invitation_status", ["pending", "accepted", "revoked"])), check("invitation_revision > 0"), check("(operation='accept' AND invitation_status='accepted' AND member_id IS NOT NULL) OR (operation = ANY (ARRAY['invite'::text,'reissue'::text]) AND invitation_status='pending' AND member_id IS NULL) OR (operation='revoke' AND invitation_status='revoked' AND member_id IS NULL)")],
    indexes: [index(["id"], true, true), index(["organization_id", "actor_user_id", "idempotency_key"], true)],
  },
];

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  return value;
}
const stable = (values: unknown[]) => values.map(value => JSON.stringify(canonicalJson(value))).sort().join("\n");
function normalizeConstraint(value: Constraint): Constraint {
  return { ...value, columns: value.kind === "c" ? [] : value.columns, expression: value.expression === null ? null : canonicalTeamSchemaExpression(value.expression) };
}

/** Read-only catalog guard. No repairs, grants, cross-tenant reads or writes. */
export async function assertCanonicalTeamAccessSchema(tx: TransactionClient): Promise<void> {
  try {
    // Hold AccessShare locks until commit so table DDL cannot invalidate this
    // comparison between the catalog read and later authorized commands.
    for (const name of [invitation, scopes, receipts]) await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(name)} where false`);
    const result = await tx.execute(sql`select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as "forceRls",
      (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
      (current_setting('session_replication_role')<>'origin'
       or exists(select 1 from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
       or exists(select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='f' and
         ((select count(*) from pg_trigger t where t.tgconstraint=k.oid and t.tgisinternal)<>4
          or exists(select 1 from pg_trigger t where t.tgconstraint=k.oid and (not t.tgisinternal or t.tgenabled not in ('O','A')))))) as "unsafeEnforcement",
      (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
       or exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x where x.grantee=0)
       or exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and x.grantee=0)) as "unsafeAcl",
      (select jsonb_agg(jsonb_build_object('name',a.attname,'typeSchema',tn.nspname,'typeName',t.typname,'notNull',a.attnotnull,'typeModifier',a.atttypmod,'defaultExpression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
       from pg_attribute a join pg_type t on t.oid=a.atttypid join pg_namespace tn on tn.oid=t.typnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
      (select jsonb_agg(jsonb_build_object('kind',k.contype,'columns',array(select a.attname from unnest(k.conkey) with ordinality v(num,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=v.num order by v.ord),
        'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'expression',pg_get_expr(k.conbin,k.conrelid),'foreignSchema',fn.nspname,'foreignTable',fc.relname,
        'foreignColumns',array(select a.attname from unnest(k.confkey) with ordinality v(num,ord) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=v.num order by v.ord),'updateAction',k.confupdtype,'deleteAction',k.confdeltype,'match',k.confmatchtype))
       from pg_constraint k left join pg_class fc on fc.oid=k.confrelid left join pg_namespace fn on fn.oid=fc.relnamespace where k.conrelid=c.oid) as constraints,
      (select jsonb_agg(jsonb_build_object('columns',array(select a.attname from unnest(i.indkey) with ordinality v(num,ord) left join pg_attribute a on a.attrelid=i.indrelid and a.attnum=v.num order by v.ord),
        'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'live',i.indislive,'nullsNotDistinct',i.indnullsnotdistinct,'method',am.amname,'predicate',pg_get_expr(i.indpred,i.indrelid),'expression',pg_get_expr(i.indexprs,i.indrelid),'keyCount',i.indnkeyatts,'columnCount',i.indnatts,
        'options',array(select opt::int from unnest(i.indoption) opt),'operatorClasses',array(select n.nspname||'.'||o.opcname from unnest(i.indclass) with ordinality v(oid,ord) join pg_opclass o on o.oid=v.oid join pg_namespace n on n.oid=o.opcnamespace order by v.ord)))
       from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_am am on am.oid=ic.relam where i.indrelid=c.oid) as indexes
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='zaltyko' and c.relname in (${invitation},${scopes},${receipts})`);
    const tables = result.rows as unknown as Table[];
    if (tables.length !== manifest.length) throw unavailable();
    for (const expected of manifest) {
      const actual = tables.find(table => table.name === expected.name);
      if (!actual || actual.kind !== "r" || !actual.rls || !actual.forceRls || actual.policies !== 0 || actual.unsafeAcl || actual.unsafeEnforcement) throw unavailable();
      const normalizeColumns = (columns: Column[]) => columns.map(column => ({ ...column, defaultExpression: column.defaultExpression === null ? null : canonicalTeamSchemaExpression(column.defaultExpression) }));
      const normalizeIndexes = (indexes: Index[]) => indexes.map(item => ({ ...item, predicate: item.predicate === null ? null : canonicalTeamSchemaExpression(item.predicate) }));
      if (stable(normalizeColumns(actual.columns)) !== stable(normalizeColumns(expected.columns)) || stable(actual.constraints.map(normalizeConstraint)) !== stable(expected.constraints.map(normalizeConstraint)) || stable(normalizeIndexes(actual.indexes)) !== stable(normalizeIndexes(expected.indexes))) throw unavailable();
    }
  } catch { throw unavailable(); }
}
