import {sql} from '@pgkit/client'
import {fsSyncer} from 'fs-syncer'
import {range} from 'lodash'
import * as path from 'path'
import {describe, expect, test, vi as jest, beforeEach} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const {pool, ...helper} = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

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


        create table "public"."patient" (
          "id" integer not null,
          "name" text,
          "address" address,
          "type" patient_type
            );


      CREATE UNIQUE INDEX patient_pkey ON public.patient USING btree (id);

      alter table "public"."patient" add constraint "patient_pkey" PRIMARY KEY using index "patient_pkey";

      create type "public"."address" as ("street" text, "city" text, "state" text, "zip" text);

      ",
      }
    `)
  })
})
