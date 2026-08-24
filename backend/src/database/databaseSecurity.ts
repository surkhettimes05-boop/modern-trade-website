import { query } from "./connection.js";

export type DatabaseRolePosture = {
  role_name: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  owns_application_objects: boolean;
  member_of_migration_role: boolean;
  can_create_database_objects: boolean;
  can_create_public_schema_objects: boolean;
};

export function assertDatabaseRolePosture(
  posture: DatabaseRolePosture,
  expectedRole = process.env.DATABASE_RUNTIME_ROLE,
): void {
  const violations = [
    expectedRole &&
      posture.role_name !== expectedRole &&
      "unexpected role identity",
    posture.rolsuper && "SUPERUSER",
    posture.rolcreaterole && "CREATEROLE",
    posture.rolcreatedb && "CREATEDB",
    posture.rolreplication && "REPLICATION",
    posture.rolbypassrls && "BYPASSRLS",
    posture.owns_application_objects && "application object ownership",
    posture.member_of_migration_role && "membership in the migration role",
    posture.can_create_database_objects && "database CREATE privilege",
    posture.can_create_public_schema_objects &&
      "public schema CREATE privilege",
  ].filter((value): value is string => Boolean(value));

  if (violations.length) {
    throw new Error(
      `Unsafe runtime database role '${posture.role_name}': ${violations.join(", ")}`,
    );
  }
}

export async function verifyDatabaseSecurityPosture(): Promise<void> {
  if (process.env.REQUIRE_LEAST_PRIVILEGE_DATABASE_ROLE !== "true") {
    return;
  }

  const result = await query(
    `SELECT current_user AS role_name,
            r.rolsuper,
            r.rolcreaterole,
            r.rolcreatedb,
            r.rolreplication,
            r.rolbypassrls,
            has_database_privilege(current_user, current_database(), 'CREATE')
              AS can_create_database_objects,
            has_schema_privilege(current_user, 'public', 'CREATE')
              AS can_create_public_schema_objects,
            EXISTS (
              SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public'
                 AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
                 AND pg_get_userbyid(c.relowner) = current_user
            ) AS owns_application_objects,
            pg_has_role(current_user, $1, 'MEMBER')
              AS member_of_migration_role
       FROM pg_roles r
      WHERE r.rolname = current_user`,
    [process.env.DATABASE_MIGRATION_ROLE],
  );
  if (!result.rows[0]) {
    throw new Error("Unable to verify the runtime database role");
  }
  assertDatabaseRolePosture(
    result.rows[0] as DatabaseRolePosture,
    process.env.DATABASE_RUNTIME_ROLE,
  );
}
