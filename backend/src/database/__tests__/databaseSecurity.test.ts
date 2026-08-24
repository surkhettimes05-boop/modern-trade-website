import { assertDatabaseRolePosture } from "../databaseSecurity.js";

const safePosture = {
  role_name: "storesync_app",
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  owns_application_objects: false,
  member_of_migration_role: false,
  can_create_database_objects: false,
  can_create_public_schema_objects: false,
};

describe("runtime database role posture", () => {
  it("accepts a non-owner least-privilege role", () => {
    expect(() =>
      assertDatabaseRolePosture(safePosture, "storesync_app"),
    ).not.toThrow();
  });

  it("rejects a connection that resolves to the wrong database identity", () => {
    expect(() =>
      assertDatabaseRolePosture(safePosture, "expected_runtime_role"),
    ).toThrow("unexpected role identity");
  });

  it.each([
    ["rolsuper", "SUPERUSER"],
    ["rolcreaterole", "CREATEROLE"],
    ["rolcreatedb", "CREATEDB"],
    ["rolreplication", "REPLICATION"],
    ["rolbypassrls", "BYPASSRLS"],
    ["owns_application_objects", "application object ownership"],
    ["member_of_migration_role", "membership in the migration role"],
    ["can_create_database_objects", "database CREATE privilege"],
    ["can_create_public_schema_objects", "public schema CREATE privilege"],
  ] as const)("rejects unsafe posture %s", (key, message) => {
    expect(() =>
      assertDatabaseRolePosture({ ...safePosture, [key]: true }),
    ).toThrow(message);
  });
});
