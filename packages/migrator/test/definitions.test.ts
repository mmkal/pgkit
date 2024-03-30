import {fsSyncer} from 'fs-syncer'
import * as path from 'path'
import {describe, expect, test, beforeEach} from 'vitest'
import {Migrator as Base} from './migrator'
import {getPoolHelper} from './pool-helper'

class Migrator extends Base {
  async runMigra() {
    const migration = await super.runMigra()
    migration.statements.array = migration.statements.array
      .map((s, i, arr) => {
        if (/create type .*address/.test(s)) {
          i = arr.findIndex(other => other.match(/create table .*patient/)) - 0.5
        }
        return {s, i, arr}
      })
      .sort((a, b) => a.i - b.i)
      .map(x => x.s)

    return migration
  }
}

const {pool, ...helper} = getPoolHelper({__filename})

describe('sort sql statements', () => {
  const migrationsPath = path.join(__dirname, `generated/${helper.id}`)

  // problem: migra doesn't do a toplogoical sort of the statements. it statically orders in a sensible way, but doesn't allow for tables to depend on functions, for example.
  // https://github.com/djrobstep/migra/issues/196
  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table patient(id int primary key, name text)',
    '02.two.sql': `
      create type address as (street text, city text, state text, zip text);
      create type patient_type as enum ('human', 'animal');
    `,
    '03.three.sql': `
      alter table patient add column address address;
      alter table patient add column type patient_type;
    `,
  })

  let migrator: Migrator

  beforeEach(async () => {
    syncer.sync()
    migrator = new Migrator({
      client: pool,
      migrationsPath,
      migrationTableName: 'migrations',
    })

    await migrator.up()
  })

  test('definitions', async () => {
    await migrator.writeDefinitionFile(syncer.baseDir + '/definitions.sql')

    expect(syncer.read()).toMatchInlineSnapshot(`
      {
        "01.one.sql": "create table patient(id int primary key, name text)",
        "02.two.sql": "
            create type address as (street text, city text, state text, zip text);
            create type patient_type as enum ('human', 'animal');
          ",
        "03.three.sql": "
            alter table patient add column address address;
            alter table patient add column type patient_type;
          ",
        "definitions.sql": "create type "public"."patient_type" as enum ('human', 'animal');

      create type "public"."address" as ("street" text, "city" text, "state" text, "zip" text);


        create table "public"."patient" (
          "id" integer not null,
          "name" text,
          "address" address,
          "type" patient_type
            );


      CREATE UNIQUE INDEX patient_pkey ON public.patient USING btree (id);

      alter table "public"."patient" add constraint "patient_pkey" PRIMARY KEY using index "patient_pkey";

      ",
      }
    `)
  })
})
