/* eslint-disable */

// To parse this data:
//
//   import { Convert, Migra } from "./file";
//
//   const migra = Convert.toMigra(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface Migra {
    SCHEMAS_QUERY:       SchemasQuery[];
    ENUMS_QUERY:         EnumsQuery[];
    ALL_RELATIONS_QUERY: AllRelationsQuery[];
    INDEXES_QUERY:       IndexesQuery[];
    SEQUENCES_QUERY:     SequencesQuery[];
    CONSTRAINTS_QUERY:   ConstraintsQuery[];
    EXTENSIONS_QUERY:    ExtensionsQuery[];
    FUNCTIONS_QUERY:     FunctionsQuery[];
    PRIVILEGES_QUERY:    any[];
    TRIGGERS_QUERY:      any[];
    COLLATIONS_QUERY:    any[];
    RLSPOLICIES_QUERY:   any[];
    TYPES_QUERY:         any[];
    DOMAINS_QUERY:       any[];
    DEPS_QUERY:          any[];
}

export interface AllRelationsQuery {
    relationtype:       Relationtype;
    schema:             Schema;
    name:               string;
    definition:         null | string;
    position_number:    number | null;
    attname:            null | string;
    not_null:           boolean | null;
    datatype:           null | string;
    is_identity:        boolean | null;
    is_identity_always: boolean | null;
    is_generated:       boolean | null;
    collation:          null;
    defaultdef:         null | string;
    oid:                number;
    datatypestring:     null | string;
    is_enum:            boolean;
    enum_name:          null | string;
    enum_schema:        Schema | null;
    comment:            null;
    parent_table:       null;
    partition_def:      null;
    rowsecurity:        boolean;
    forcerowsecurity:   boolean;
    persistence:        Persistence;
    page_size_estimate: number;
    row_count_estimate: number;
}

export enum Schema {
    Public = "public",
}

export enum Persistence {
    P = "p",
    U = "u",
}

export enum Relationtype {
    M = "m",
    R = "r",
    V = "v",
}

export interface ConstraintsQuery {
    schema:               Schema;
    name:                 string;
    table_name:           string;
    definition:           string;
    constraint_type:      string;
    index:                null | string;
    extension_oid:        null;
    foreign_table_schema: Schema | null;
    foreign_table_name:   null | string;
    fk_columns_local:     null | string;
    fk_columns_foreign:   null | string;
    is_fk:                boolean;
    is_deferrable:        boolean;
    initially_deferred:   boolean;
}

export interface EnumsQuery {
    schema:   Schema;
    name:     string;
    elements: string[];
}

export interface ExtensionsQuery {
    schema:  string;
    name:    string;
    version: string;
    oid:     number;
}

export interface FunctionsQuery {
    schema:                      Schema;
    name:                        string;
    returntype:                  string;
    has_user_defined_returntype: boolean;
    parameter_name:              string;
    data_type:                   string;
    parameter_mode:              string;
    parameter_default:           null;
    position_number:             number;
    definition:                  string;
    full_definition:             string;
    language:                    string;
    strictness:                  string;
    security_type:               string;
    volatility:                  string;
    kind:                        string;
    oid:                         number;
    extension_oid:               null;
    result_string:               string;
    identity_arguments:          string;
    comment:                     null;
}

export interface IndexesQuery {
    schema:                Schema;
    table_name:            string;
    name:                  string;
    oid:                   number;
    extension_oid:         null;
    definition:            string;
    index_columns:         string;
    key_options:           string;
    total_column_count:    number;
    key_column_count:      number;
    num_att:               number;
    included_column_count: number;
    is_unique:             boolean;
    is_pk:                 boolean;
    is_exclusion:          boolean;
    is_immediate:          boolean;
    is_clustered:          boolean;
    key_collations:        string;
    key_expressions:       null;
    partial_predicate:     null;
    algorithm:             string;
    key_columns:           string;
    included_columns:      string;
}

export interface SchemasQuery {
    schema: string;
}

export interface SequencesQuery {
    schema:      Schema;
    name:        string;
    table_name:  string;
    column_name: string;
    is_identity: boolean;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toMigra(json: string): Migra {
        return cast(JSON.parse(json), r("Migra"));
    }

    public static migraToJson(value: Migra): string {
        return JSON.stringify(uncast(value, r("Migra")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "Migra": o([
        { json: "SCHEMAS_QUERY", js: "SCHEMAS_QUERY", typ: a(r("SchemasQuery")) },
        { json: "ENUMS_QUERY", js: "ENUMS_QUERY", typ: a(r("EnumsQuery")) },
        { json: "ALL_RELATIONS_QUERY", js: "ALL_RELATIONS_QUERY", typ: a(r("AllRelationsQuery")) },
        { json: "INDEXES_QUERY", js: "INDEXES_QUERY", typ: a(r("IndexesQuery")) },
        { json: "SEQUENCES_QUERY", js: "SEQUENCES_QUERY", typ: a(r("SequencesQuery")) },
        { json: "CONSTRAINTS_QUERY", js: "CONSTRAINTS_QUERY", typ: a(r("ConstraintsQuery")) },
        { json: "EXTENSIONS_QUERY", js: "EXTENSIONS_QUERY", typ: a(r("ExtensionsQuery")) },
        { json: "FUNCTIONS_QUERY", js: "FUNCTIONS_QUERY", typ: a(r("FunctionsQuery")) },
        { json: "PRIVILEGES_QUERY", js: "PRIVILEGES_QUERY", typ: a("any") },
        { json: "TRIGGERS_QUERY", js: "TRIGGERS_QUERY", typ: a("any") },
        { json: "COLLATIONS_QUERY", js: "COLLATIONS_QUERY", typ: a("any") },
        { json: "RLSPOLICIES_QUERY", js: "RLSPOLICIES_QUERY", typ: a("any") },
        { json: "TYPES_QUERY", js: "TYPES_QUERY", typ: a("any") },
        { json: "DOMAINS_QUERY", js: "DOMAINS_QUERY", typ: a("any") },
        { json: "DEPS_QUERY", js: "DEPS_QUERY", typ: a("any") },
    ], false),
    "AllRelationsQuery": o([
        { json: "relationtype", js: "relationtype", typ: r("Relationtype") },
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "name", js: "name", typ: "" },
        { json: "definition", js: "definition", typ: u(null, "") },
        { json: "position_number", js: "position_number", typ: u(0, null) },
        { json: "attname", js: "attname", typ: u(null, "") },
        { json: "not_null", js: "not_null", typ: u(true, null) },
        { json: "datatype", js: "datatype", typ: u(null, "") },
        { json: "is_identity", js: "is_identity", typ: u(true, null) },
        { json: "is_identity_always", js: "is_identity_always", typ: u(true, null) },
        { json: "is_generated", js: "is_generated", typ: u(true, null) },
        { json: "collation", js: "collation", typ: null },
        { json: "defaultdef", js: "defaultdef", typ: u(null, "") },
        { json: "oid", js: "oid", typ: 0 },
        { json: "datatypestring", js: "datatypestring", typ: u(null, "") },
        { json: "is_enum", js: "is_enum", typ: true },
        { json: "enum_name", js: "enum_name", typ: u(null, "") },
        { json: "enum_schema", js: "enum_schema", typ: u(r("Schema"), null) },
        { json: "comment", js: "comment", typ: null },
        { json: "parent_table", js: "parent_table", typ: null },
        { json: "partition_def", js: "partition_def", typ: null },
        { json: "rowsecurity", js: "rowsecurity", typ: true },
        { json: "forcerowsecurity", js: "forcerowsecurity", typ: true },
        { json: "persistence", js: "persistence", typ: r("Persistence") },
        { json: "page_size_estimate", js: "page_size_estimate", typ: 0 },
        { json: "row_count_estimate", js: "row_count_estimate", typ: 0 },
    ], false),
    "ConstraintsQuery": o([
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "name", js: "name", typ: "" },
        { json: "table_name", js: "table_name", typ: "" },
        { json: "definition", js: "definition", typ: "" },
        { json: "constraint_type", js: "constraint_type", typ: "" },
        { json: "index", js: "index", typ: u(null, "") },
        { json: "extension_oid", js: "extension_oid", typ: null },
        { json: "foreign_table_schema", js: "foreign_table_schema", typ: u(r("Schema"), null) },
        { json: "foreign_table_name", js: "foreign_table_name", typ: u(null, "") },
        { json: "fk_columns_local", js: "fk_columns_local", typ: u(null, "") },
        { json: "fk_columns_foreign", js: "fk_columns_foreign", typ: u(null, "") },
        { json: "is_fk", js: "is_fk", typ: true },
        { json: "is_deferrable", js: "is_deferrable", typ: true },
        { json: "initially_deferred", js: "initially_deferred", typ: true },
    ], false),
    "EnumsQuery": o([
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "name", js: "name", typ: "" },
        { json: "elements", js: "elements", typ: a("") },
    ], false),
    "ExtensionsQuery": o([
        { json: "schema", js: "schema", typ: "" },
        { json: "name", js: "name", typ: "" },
        { json: "version", js: "version", typ: "" },
        { json: "oid", js: "oid", typ: 0 },
    ], false),
    "FunctionsQuery": o([
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "name", js: "name", typ: "" },
        { json: "returntype", js: "returntype", typ: "" },
        { json: "has_user_defined_returntype", js: "has_user_defined_returntype", typ: true },
        { json: "parameter_name", js: "parameter_name", typ: "" },
        { json: "data_type", js: "data_type", typ: "" },
        { json: "parameter_mode", js: "parameter_mode", typ: "" },
        { json: "parameter_default", js: "parameter_default", typ: null },
        { json: "position_number", js: "position_number", typ: 0 },
        { json: "definition", js: "definition", typ: "" },
        { json: "full_definition", js: "full_definition", typ: "" },
        { json: "language", js: "language", typ: "" },
        { json: "strictness", js: "strictness", typ: "" },
        { json: "security_type", js: "security_type", typ: "" },
        { json: "volatility", js: "volatility", typ: "" },
        { json: "kind", js: "kind", typ: "" },
        { json: "oid", js: "oid", typ: 0 },
        { json: "extension_oid", js: "extension_oid", typ: null },
        { json: "result_string", js: "result_string", typ: "" },
        { json: "identity_arguments", js: "identity_arguments", typ: "" },
        { json: "comment", js: "comment", typ: null },
    ], false),
    "IndexesQuery": o([
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "table_name", js: "table_name", typ: "" },
        { json: "name", js: "name", typ: "" },
        { json: "oid", js: "oid", typ: 0 },
        { json: "extension_oid", js: "extension_oid", typ: null },
        { json: "definition", js: "definition", typ: "" },
        { json: "index_columns", js: "index_columns", typ: "" },
        { json: "key_options", js: "key_options", typ: "" },
        { json: "total_column_count", js: "total_column_count", typ: 0 },
        { json: "key_column_count", js: "key_column_count", typ: 0 },
        { json: "num_att", js: "num_att", typ: 0 },
        { json: "included_column_count", js: "included_column_count", typ: 0 },
        { json: "is_unique", js: "is_unique", typ: true },
        { json: "is_pk", js: "is_pk", typ: true },
        { json: "is_exclusion", js: "is_exclusion", typ: true },
        { json: "is_immediate", js: "is_immediate", typ: true },
        { json: "is_clustered", js: "is_clustered", typ: true },
        { json: "key_collations", js: "key_collations", typ: "" },
        { json: "key_expressions", js: "key_expressions", typ: null },
        { json: "partial_predicate", js: "partial_predicate", typ: null },
        { json: "algorithm", js: "algorithm", typ: "" },
        { json: "key_columns", js: "key_columns", typ: "" },
        { json: "included_columns", js: "included_columns", typ: "" },
    ], false),
    "SchemasQuery": o([
        { json: "schema", js: "schema", typ: "" },
    ], false),
    "SequencesQuery": o([
        { json: "schema", js: "schema", typ: r("Schema") },
        { json: "name", js: "name", typ: "" },
        { json: "table_name", js: "table_name", typ: "" },
        { json: "column_name", js: "column_name", typ: "" },
        { json: "is_identity", js: "is_identity", typ: true },
    ], false),
    "Schema": [
        "public",
    ],
    "Persistence": [
        "p",
        "u",
    ],
    "Relationtype": [
        "m",
        "r",
        "v",
    ],
};
